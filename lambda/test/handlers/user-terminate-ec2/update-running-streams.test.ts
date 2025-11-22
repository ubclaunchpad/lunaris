import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-terminate-ec2/update-running-streams";
import { withEnv } from "../../utils/dynamoMock";

const dynamoMock = mockClient(DynamoDBDocumentClient);

const baseEvent = {
    userId: "user-123",
    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0",
    previousState: "running",
    currentState: "shutting-down",
};

let restoreEnv: () => void;

describe("update-running-streams handler", () => {
    beforeEach(() => {
        restoreEnv = withEnv({ RUNNING_STREAMS_TABLE_NAME: "running-streams-table" });
        dynamoMock.reset();
    });

    afterEach(() => {
        restoreEnv();
    });

    it("successfully deletes stream record from DynamoDB", async () => {
        dynamoMock.on(DeleteCommand).resolves({});

        const result = await handler(baseEvent);

        expect(result.success).toBe(true);

        const deleteCalls = dynamoMock.commandCalls(DeleteCommand);
        expect(deleteCalls).toHaveLength(1);
        expect(deleteCalls[0].args[0].input.Key).toEqual({
            instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0",
        });
        expect(deleteCalls[0].args[0].input.TableName).toBe("running-streams-table");
    });

    it("throws error when instanceArn is missing", async () => {
        await expect(
            handler({
                userId: "user-123",
                previousState: "running",
                currentState: "shutting-down",
            } as any),
        ).rejects.toThrow("Instance ARN is required");
    });

    it("throws MissingTableNameEnv error when env var not set", async () => {
        restoreEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(handler(baseEvent)).rejects.toThrow("MissingTableNameEnv");
    });

    it("handles DynamoDB delete failures gracefully", async () => {
        dynamoMock.on(DeleteCommand).rejects(new Error("DynamoDB error"));

        await expect(handler(baseEvent)).rejects.toThrow("DatabaseError");
    });

    it("handles non-existent record deletion gracefully", async () => {
        dynamoMock.on(DeleteCommand).resolves({});

        const result = await handler(baseEvent);

        expect(result.success).toBe(true);
    });

    it("handles DynamoDB throttling errors", async () => {
        const throttlingError = new Error("ProvisionedThroughputExceededException");
        dynamoMock.on(DeleteCommand).rejects(throttlingError);

        await expect(handler(baseEvent)).rejects.toThrow("DatabaseError");
    });
});
