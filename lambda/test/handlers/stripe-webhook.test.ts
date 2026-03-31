process.env.STRIPE_WH_SECRET = "whsec_test_secret";
process.env.USER_PAYMENTS_TABLE_NAME = "test-user-payments";
process.env.USER_BALANCES_TABLE_NAME = "test-user-balances";
process.env.RUNNING_INSTANCES_TABLE_NAME = "test-running-instances";
process.env.RUNNING_STREAMS_TABLE_NAME = "test-running-streams";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.USER_DEPLOY_EC2_WORKFLOW_ARN = "arn:aws:states:us-east-1:123:stateMachine:test";

import { APIGatewayProxyEvent } from "aws-lambda";
import { QueryCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoMock, withEnv } from "../utils/dynamoMock";

jest.mock("../../src/utils/stripeWrapper", () => ({
    constructWebhookEvent: jest.fn(),
    createCheckoutSession: jest.fn(),
    getCheckoutSession: jest.fn(),
    findOrCreateCustomer: jest.fn(),
}));

import { handler } from "../../src/handlers/api";
import { constructWebhookEvent } from "../../src/utils/stripeWrapper";

const mockConstructWebhookEvent = constructWebhookEvent as jest.MockedFunction<
    typeof constructWebhookEvent
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeWebhookEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => ({
    httpMethod: "POST",
    path: "/stripe-webhook",
    resource: "/stripe-webhook",
    headers: { "stripe-signature": "test_sig_123" },
    body: JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
    isBase64Encoded: false,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent["requestContext"],
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    ...overrides,
});

const mockSession = {
    id: "cs_test_123",
    customer: "cus_test_456",
    metadata: { planId: "STARTER", userId: "user-123" },
    customer_details: { email: "test@example.com" },
    amount_total: 299,
};

// ---------------------------------------------------------------------------
// Env setup
// ---------------------------------------------------------------------------

let restoreEnv: () => void;

beforeEach(() => {
    dynamoMock.reset();
    jest.clearAllMocks();
    restoreEnv = () => {
        // no-op by default; overridden in specific tests that need to mutate env
    };
});

afterEach(() => {
    restoreEnv();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /stripe-webhook", () => {
    describe("signature verification", () => {
        it("returns 400 when stripe-signature header is missing", async () => {
            const event = makeWebhookEvent({ headers: {} });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).message).toContain("Missing stripe-signature");
        });

        it("returns 400 when signature is invalid", async () => {
            mockConstructWebhookEvent.mockImplementation(() => {
                throw new Error("Invalid signature");
            });

            const event = makeWebhookEvent();

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
        });

        it("returns 500 when STRIPE_WH_SECRET is not set", async () => {
            restoreEnv = withEnv({ STRIPE_WH_SECRET: undefined });

            const event = makeWebhookEvent();

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(JSON.parse(result.body).message).toContain("not configured");
        });
    });

    describe("checkout.session.completed", () => {
        beforeEach(() => {
            mockConstructWebhookEvent.mockReturnValue({
                type: "checkout.session.completed",
                data: { object: mockSession },
            } as unknown as ReturnType<typeof constructWebhookEvent>);

            // Idempotency check — no existing record
            dynamoMock.on(QueryCommand).resolves({ Items: [] });
            dynamoMock.on(PutCommand).resolves({});
            dynamoMock.on(UpdateCommand).resolves({});
        });

        it("creates payment record and updates balance", async () => {
            const event = makeWebhookEvent();

            const result = await handler(event);

            expect(result.statusCode).toBe(200);

            const putCalls = dynamoMock.commandCalls(PutCommand);
            expect(putCalls).toHaveLength(1);
            expect(putCalls[0].args[0].input.Item).toMatchObject({
                userId: "user-123",
                stripeSessionId: "cs_test_123",
                planId: "STARTER",
                coins: 100,
            });

            const updateCalls = dynamoMock.commandCalls(UpdateCommand);
            expect(updateCalls).toHaveLength(1);
            expect(updateCalls[0].args[0].input.UpdateExpression).toContain("ADD coins");
        });

        it("is idempotent — skips duplicate sessions", async () => {
            // Idempotency check returns an existing record
            dynamoMock.on(QueryCommand).resolves({
                Items: [{ userId: "user-123", stripeSessionId: "cs_test_123" }],
            });

            const event = makeWebhookEvent();

            const result = await handler(event);

            expect(result.statusCode).toBe(200);

            expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(0);
        });

        it("handles missing planId in metadata gracefully", async () => {
            mockConstructWebhookEvent.mockReturnValue({
                type: "checkout.session.completed",
                data: {
                    object: {
                        ...mockSession,
                        metadata: {},
                    },
                },
            } as ReturnType<typeof constructWebhookEvent>);

            const event = makeWebhookEvent();

            const result = await handler(event);

            expect(result.statusCode).toBe(200);

            expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(0);
            expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(0);
        });
    });

    describe("unhandled event types", () => {
        it("returns 200 for unknown event types", async () => {
            mockConstructWebhookEvent.mockReturnValue({
                type: "invoice.paid",
                data: { object: {} },
            } as ReturnType<typeof constructWebhookEvent>);

            const event = makeWebhookEvent();

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
        });
    });

    describe("base64 body decoding", () => {
        it("decodes base64-encoded body and passes it to constructWebhookEvent", async () => {
            mockConstructWebhookEvent.mockReturnValue({
                type: "invoice.paid",
                data: { object: {} },
            } as ReturnType<typeof constructWebhookEvent>);

            const rawPayload = JSON.stringify({ id: "evt_test", type: "invoice.paid" });
            const base64Body = Buffer.from(rawPayload).toString("base64");

            const event = makeWebhookEvent({
                isBase64Encoded: true,
                body: base64Body,
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(mockConstructWebhookEvent).toHaveBeenCalledWith(
                rawPayload,
                expect.any(String),
                expect.any(String),
            );
        });
    });
});
