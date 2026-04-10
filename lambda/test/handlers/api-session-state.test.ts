process.env.RUNNING_INSTANCES_TABLE_NAME = "test-running-instances";
process.env.RUNNING_STREAMS_TABLE_NAME = "test-running-streams";
process.env.TERMINATE_WORKFLOW_ARN = "arn:aws:states:us-east-1:123:stateMachine:terminate";
process.env.USER_DEPLOY_EC2_WORKFLOW_ARN = "arn:aws:states:us-east-1:123:stateMachine:deploy";
process.env.GAMES_TABLE_NAME = "test-games";
process.env.USER_PAYMENTS_TABLE_NAME = "test-user-payments";
process.env.USER_BALANCES_TABLE_NAME = "test-user-balances";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WH_SECRET = "whsec_test_secret";

import { APIGatewayProxyEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import {
    SFNClient,
    StartExecutionCommand,
    DescribeExecutionCommand,
    GetExecutionHistoryCommand,
} from "@aws-sdk/client-sfn";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoMock } from "../utils/dynamoMock";

jest.mock("../../src/utils/stripeWrapper", () => ({
    constructWebhookEvent: jest.fn(),
    createCheckoutSession: jest.fn(),
    getCheckoutSession: jest.fn(),
    findOrCreateCustomer: jest.fn(),
}));

import { handler } from "../../src/handlers/api";

const sfnMock = mockClient(SFNClient);

const makeEvent = (
    path: string,
    method: string,
    options: {
        body?: Record<string, unknown>;
        query?: Record<string, string>;
    } = {},
): APIGatewayProxyEvent =>
    ({
        resource: path,
        path,
        httpMethod: method,
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: options.query ?? null,
        multiValueQueryStringParameters: null,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as APIGatewayProxyEvent["requestContext"],
        body: options.body ? JSON.stringify(options.body) : null,
        isBase64Encoded: false,
    }) as APIGatewayProxyEvent;

describe("API session-state regressions", () => {
    beforeEach(() => {
        dynamoMock.reset();
        sfnMock.reset();
        jest.clearAllMocks();
    });

    describe("POST /terminateInstance", () => {
        it("persists the new terminate execution and transitional state for the active session", async () => {
            const executionArn =
                "arn:aws:states:us-east-1:123:execution:UserTerminateEC2Workflow:user-123-1";

            sfnMock.on(StartExecutionCommand).resolves({
                executionArn,
                startDate: new Date("2026-04-10T00:00:00.000Z"),
                $metadata: {},
            });

            const response = await handler(
                makeEvent("/terminateInstance", "POST", {
                    body: { userId: "user-123", instanceId: "i-123" },
                }),
            );

            expect(response.statusCode).toBe(200);

            const updateInputs = dynamoMock.commandCalls(UpdateCommand).map((call) => call.args[0].input);
            const putInputs = dynamoMock.commandCalls(PutCommand).map((call) => call.args[0].input);
            const mutationInputs = [...updateInputs, ...putInputs];

            expect(mutationInputs.length).toBeGreaterThan(0);
            expect(JSON.stringify(mutationInputs)).toContain(executionArn);
            expect(JSON.stringify(mutationInputs)).toContain("terminating");
        });
    });

    describe("GET /streamingLink", () => {
        it.failing("returns inactive when only stopped sessions exist", async () => {
            dynamoMock.on(QueryCommand).resolves({
                Items: [
                    {
                        userId: "user-123",
                        instanceId: "i-stopped",
                        instanceArn: "arn:aws:ec2:us-west-2:123:instance/i-stopped",
                        status: "stopped",
                        streamingLink: "https://stale.example.com:8443",
                        dcvUser: "Administrator",
                        dcvPassword: "pw",
                        createdAt: "2026-04-10T00:00:00.000Z",
                    },
                ],
            });

            const response = await handler(
                makeEvent("/streamingLink", "GET", {
                    query: { userId: "user-123" },
                }),
            );

            expect(response.statusCode).toBe(404);
            expect(JSON.parse(response.body).message).toContain("No active streaming session");
        });

        it.failing("prefers the newest running session over a stale stopped row", async () => {
            dynamoMock.on(QueryCommand).resolves({
                Items: [
                    {
                        userId: "user-123",
                        instanceId: "i-stopped",
                        instanceArn: "arn:aws:ec2:us-west-2:123:instance/i-stopped",
                        status: "stopped",
                        streamingLink: "https://stale.example.com:8443",
                        dcvUser: "Administrator",
                        dcvPassword: "old-pw",
                        createdAt: "2026-04-10T00:00:00.000Z",
                    },
                    {
                        userId: "user-123",
                        instanceId: "i-running",
                        instanceArn: "arn:aws:ec2:us-west-2:123:instance/i-running",
                        status: "running",
                        streamingLink: "https://live.example.com:8443",
                        dcvUser: "Administrator",
                        dcvPassword: "new-pw",
                        createdAt: "2026-04-09T23:59:00.000Z",
                    },
                ],
            });

            const response = await handler(
                makeEvent("/streamingLink", "GET", {
                    query: { userId: "user-123" },
                }),
            );

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.instanceId).toBe("i-running");
            expect(body.streamingLink).toBe("https://live.example.com:8443");
        });
    });

    describe("GET /deployment-status", () => {
        it("prefers the active terminate execution over an older deploy execution", async () => {
            const terminateExecutionArn =
                "arn:aws:states:us-east-1:123:execution:UserTerminateEC2Workflow:user-123-2";
            const deployExecutionArn =
                "arn:aws:states:us-east-1:123:execution:UserDeployEC2Workflow:user-123-1";

            dynamoMock.on(QueryCommand).resolves({
                Items: [
                    {
                        instanceId: "i-123",
                        userId: "user-123",
                        executionArn: deployExecutionArn,
                        status: "running",
                        creationTime: "2026-04-09T23:55:00.000Z",
                    },
                    {
                        instanceId: "i-123",
                        userId: "user-123",
                        executionArn: terminateExecutionArn,
                        status: "terminating",
                        creationTime: "2026-04-10T00:00:00.000Z",
                    },
                ],
            });

            sfnMock.on(DescribeExecutionCommand).resolves({
                status: "RUNNING",
                executionArn: terminateExecutionArn,
                startDate: new Date("2026-04-10T00:00:00.000Z"),
                $metadata: {},
            });

            sfnMock.on(GetExecutionHistoryCommand).resolves({
                events: [
                    {
                        type: "TaskStateEntered",
                        stateEnteredEventDetails: { name: "StopEC2" },
                    },
                ],
                $metadata: {},
            });

            const response = await handler(
                makeEvent("/deployment-status", "GET", {
                    query: { userId: "user-123" },
                }),
            );

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.status).toBe("RUNNING");
            expect(body.deploymentStatus).toBe("terminating");
            const describeCalls = sfnMock.commandCalls(DescribeExecutionCommand);
            expect(describeCalls).toHaveLength(1);
            expect(describeCalls[0].args[0].input.executionArn).toBe(terminateExecutionArn);
        });
    });
});
