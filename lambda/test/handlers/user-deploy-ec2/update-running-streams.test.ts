import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-deploy-ec2/update-running-streams";
import { dynamoMock, ensureInstancesTableEnv, ensureStreamsTableEnv } from "../../utils/dynamoMock";

let restoreStreamsEnv: () => void;
let restoreInstancesEnv: () => void;

const validEvent = {
    userId: "user-123",
    instanceId: "i-abc",
    instanceArn: "arn:aws:ec2:us-west-2:123:instance/i-abc",
    dcvIp: "54.12.34.56",
    dcvPort: 8443,
    dcvUser: "Administrator",
    dcvPassword: "secret",
};

describe("user-deploy-ec2/update-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreStreamsEnv = ensureStreamsTableEnv();
        restoreInstancesEnv = ensureInstancesTableEnv();
    });

    afterEach(() => {
        restoreStreamsEnv();
        restoreInstancesEnv();
    });

    it("updates running streams and returns success", async () => {
        dynamoMock.on(UpdateCommand).resolves({});
        dynamoMock.on(QueryCommand).resolves({ Items: [] });

        const result = await handler(validEvent, {} as any);
        expect(result).toEqual({ success: true, instanceId: "i-abc" });

        const updateCalls = dynamoMock.commandCalls(UpdateCommand);
        expect(updateCalls).toHaveLength(1);
        const input = updateCalls[0].args[0].input;

        expect(input.Key).toEqual({ instanceArn: validEvent.instanceArn });
        expect(input.ExpressionAttributeValues).toMatchObject({
            ":instanceId": "i-abc",
            ":dcvIp": "54.12.34.56",
            ":dcvPort": 8443,
            ":dcvUser": "Administrator",
            ":dcvPassword": "secret",
            ":status": "running",
            ":streamingLink": "https://54-12-34-56.nip.io:8443",
        });
    });

    it("throws when required table env is missing", async () => {
        restoreStreamsEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(handler(validEvent, {} as any)).rejects.toThrow("MissingTableNameEnv");
    });

    it("throws when instanceArn is missing", async () => {
        await expect(handler({ ...validEvent, instanceArn: "" }, {} as any)).rejects.toThrow(
            "Missing required field: instanceArn",
        );
    });

    it("best-effort updates RunningInstances placeholder record when found", async () => {
        dynamoMock.on(UpdateCommand).resolves({});
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                {
                    instanceId: "pending-123",
                    executionArn: "exec-1",
                    creationTime: "2024-01-01T00:00:00.000Z",
                },
            ],
        });
        dynamoMock.on(DeleteCommand).resolves({});

        const result = await handler(validEvent, {} as any);
        expect(result.success).toBe(true);

        const deleteCalls = dynamoMock.commandCalls(DeleteCommand);
        expect(deleteCalls).toHaveLength(1);
        expect(deleteCalls[0].args[0].input.Key).toEqual({ instanceId: "pending-123" });
    });

    it("does not fail overall when RunningInstances migration errors", async () => {
        dynamoMock.on(UpdateCommand).resolves({});
        dynamoMock.on(QueryCommand).rejects(new Error("query-failed"));

        await expect(handler(validEvent, {} as any)).resolves.toEqual({
            success: true,
            instanceId: "i-abc",
        });
    });
});
