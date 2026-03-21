import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-terminate-ec2/check-running-streams";
import { dynamoMock, ensureStreamsTableEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-terminate-ec2/check-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureStreamsTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    it("returns valid=true when a running session exists", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                {
                    userId: "user-123",
                    status: "running",
                    sessionId: "session-456",
                    instanceId: "i-abc",
                    instanceArn: "arn:aws:ec2:region:acct:instance/i-abc",
                },
            ],
        });

        await expect(handler({ userId: "user-123" })).resolves.toEqual({
            valid: true,
            sessionId: "session-456",
            instanceId: "i-abc",
            instanceArn: "arn:aws:ec2:region:acct:instance/i-abc",
        });
    });

    it("falls back to userId when sessionId is absent", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                {
                    userId: "user-456",
                    status: "running",
                    instanceId: "i-def",
                    instanceArn: "arn:aws:ec2:region:acct:instance/i-def",
                },
            ],
        });

        await expect(handler({ userId: "user-456" })).resolves.toEqual({
            valid: true,
            sessionId: "user-456",
            instanceId: "i-def",
            instanceArn: "arn:aws:ec2:region:acct:instance/i-def",
        });
    });

    it("returns valid=false when no running session exists", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: [{ status: "stopped" }] });

        await expect(handler({ userId: "user-123" })).resolves.toEqual({
            valid: false,
            message: "No active streaming session found for user",
        });
    });

    it("throws when RUNNING_STREAMS_TABLE_NAME is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(handler({ userId: "user-123" })).rejects.toThrow("MissingTableNameEnv");
    });

    it("propagates DynamoDB errors", async () => {
        dynamoMock.on(QueryCommand).rejects(new Error("ddb-error"));

        await expect(handler({ userId: "user-123" })).rejects.toThrow("ddb-error");
    });
});
