import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-terminate-ec2/check-running-streams";
import { withEnv } from "../../utils/dynamoMock";

const dynamoMock = mockClient(DynamoDBDocumentClient);

const baseEvent = {
    userId: "user-123",
};

let restoreEnv: () => void;

describe("check-running-streams handler", () => {
    beforeEach(() => {
        restoreEnv = withEnv({ RUNNING_STREAMS_TABLE_NAME: "running-streams-table" });
        dynamoMock.reset();
    });

    afterEach(() => {
        restoreEnv();
    });

    const mockSuccessfulQuery = () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0",
                    userId: "user-123",
                    streamingId: "stream-456",
                    streamingLink: "https://stream.example.com/stream-456",
                    createdAt: "2024-01-01T00:00:00Z",
                    updatedAt: "2024-01-01T00:00:00Z",
                },
            ],
        });
    };

    it("returns valid stream with instanceId and instanceArn when user has active stream", async () => {
        mockSuccessfulQuery();

        const result = await handler(baseEvent);

        expect(result.valid).toBe(true);
        expect(result.userId).toBe("user-123");
        expect(result.instanceArn).toBe(
            "arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0",
        );
        expect(result.instanceId).toBe("i-1234567890abcdef0");

        const queryCalls = dynamoMock.commandCalls(QueryCommand);
        expect(queryCalls).toHaveLength(1);
        expect(queryCalls[0].args[0].input.IndexName).toBe("UserIdIndex");
        expect(queryCalls[0].args[0].input.KeyConditionExpression).toBe("userId = :userId");
    });

    it("returns valid: false when user has no active streams", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [],
        });

        const result = await handler(baseEvent);

        expect(result.valid).toBe(false);
        expect(result.message).toBe("No active streaming session found for user");
        expect(result.instanceArn).toBeUndefined();
        expect(result.instanceId).toBeUndefined();
    });

    it("returns first stream when user has multiple active streams", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-first",
                    userId: "user-123",
                },
                {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-second",
                    userId: "user-123",
                },
            ],
        });

        const result = await handler(baseEvent);

        expect(result.valid).toBe(true);
        expect(result.instanceId).toBe("i-first");
    });

    it("throws error when userId is missing", async () => {
        await expect(handler({} as any)).rejects.toThrow("User ID is required");
    });

    it("throws MissingTableNameEnv error when env var not set", async () => {
        restoreEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(handler(baseEvent)).rejects.toThrow("MissingTableNameEnv");
    });

    it("handles DynamoDB query failures gracefully", async () => {
        dynamoMock.on(QueryCommand).rejects(new Error("DynamoDB error"));

        await expect(handler(baseEvent)).rejects.toThrow("DatabaseError");
    });

    it("correctly extracts instanceId from instanceArn", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-abc123def456",
                    userId: "user-123",
                },
            ],
        });

        const result = await handler(baseEvent);

        expect(result.instanceId).toBe("i-abc123def456");
    });

    it("handles instanceArn without instanceId segment", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/",
                    userId: "user-123",
                },
            ],
        });

        const result = await handler(baseEvent);

        expect(result.instanceId).toBe("");
    });
});
