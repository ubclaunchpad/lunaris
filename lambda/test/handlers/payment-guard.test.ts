process.env.USER_BALANCES_TABLE_NAME = "test-user-balances";
process.env.RUNNING_INSTANCES_TABLE_NAME = "test-running-instances";
process.env.RUNNING_STREAMS_TABLE_NAME = "test-running-streams";
process.env.USER_DEPLOY_EC2_WORKFLOW_ARN = "arn:aws:states:us-east-1:123:stateMachine:test";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WH_SECRET = "whsec_test_secret";
process.env.USER_PAYMENTS_TABLE_NAME = "test-user-payments";

import { APIGatewayProxyEvent } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoMock, withEnv } from "../utils/dynamoMock";

jest.mock("../../src/utils/stripeWrapper", () => ({
    constructWebhookEvent: jest.fn(),
    createCheckoutSession: jest.fn(),
    getCheckoutSession: jest.fn(),
    findOrCreateCustomer: jest.fn(),
}));

jest.mock("@aws-sdk/client-sfn", () => {
    const actual = jest.requireActual("@aws-sdk/client-sfn");
    return {
        ...actual,
        SFNClient: jest.fn().mockImplementation(() => ({
            send: jest.fn().mockResolvedValue({
                executionArn: "arn:aws:states:us-east-1:123:execution:test:test-123",
                startDate: new Date(),
                $metadata: {},
            }),
        })),
    };
});

import { handler } from "../../src/handlers/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDeployEvent = (body: Record<string, unknown> = {}): APIGatewayProxyEvent => ({
    httpMethod: "POST",
    path: "/deployInstance",
    resource: "/deployInstance",
    headers: {},
    body: JSON.stringify(body),
    isBase64Encoded: false,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent["requestContext"],
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
});

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

describe("POST /deployInstance - payment guard", () => {
    it("returns 400 when userId is missing", async () => {
        const event = makeDeployEvent({});

        const result = await handler(event);

        expect(result.statusCode).toBe(400);
    });

    it("returns 402 when user has no balance record", async () => {
        dynamoMock.on(GetCommand).resolves({ Item: undefined });

        const event = makeDeployEvent({ userId: "user-123" });

        const result = await handler(event);

        expect(result.statusCode).toBe(402);
        expect(JSON.parse(result.body).status).toBe("payment_required");
    });

    it("returns 402 when user has zero coins", async () => {
        dynamoMock.on(GetCommand).resolves({ Item: { userId: "user-123", coins: 0 } });

        const event = makeDeployEvent({ userId: "user-123" });

        const result = await handler(event);

        expect(result.statusCode).toBe(402);
        expect(JSON.parse(result.body).status).toBe("payment_required");
    });

    it("allows deploy when user has positive balance", async () => {
        dynamoMock.on(GetCommand).resolves({ Item: { userId: "user-123", coins: 100 } });

        const event = makeDeployEvent({ userId: "user-123" });

        const result = await handler(event);

        // Payment guard must not block — any non-402 is acceptable here
        expect(result.statusCode).not.toBe(402);
    });
});
