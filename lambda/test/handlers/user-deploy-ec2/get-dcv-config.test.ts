import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-deploy-ec2/get-dcv-config";
import { dynamoMock, ensureStreamsTableEnv } from "../../utils/dynamoMock";

const INSTANCE_ARN = "arn:aws:ec2:us-west-2:123456789012:instance/i-abc123";

let restoreEnv: () => void;

describe("user-deploy-ec2/get-dcv-config", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureStreamsTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    // ── Environment ───────────────────────────────────────────────────────────

    it("throws MissingTableNameEnv when RUNNING_STREAMS_TABLE_NAME is not set", async () => {
        restoreEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(handler({ instanceArn: INSTANCE_ARN })).rejects.toThrow("MissingTableNameEnv");
    });

    // ── Not found ─────────────────────────────────────────────────────────────

    it("throws StreamNotFound when getItem returns null", async () => {
        dynamoMock.on(GetCommand).resolves({ Item: undefined });

        await expect(handler({ instanceArn: INSTANCE_ARN })).rejects.toThrow("StreamNotFound");
    });

    // ── Full item ─────────────────────────────────────────────────────────────

    it("returns all DCV config fields when they are all present in the stream record", async () => {
        dynamoMock.on(GetCommand).resolves({
            Item: {
                instanceArn: INSTANCE_ARN,
                dcvPassword: "s3cr3t",
                dcvUser: "StreamUser",
                dcvPort: "9999",
                dcvIp: "54.1.2.3",
            },
        });

        const result = await handler({ instanceArn: INSTANCE_ARN });

        expect(result).toEqual({
            dcvPassword: "s3cr3t",
            dcvUser: "StreamUser",
            dcvPort: "9999",
            dcvIp: "54.1.2.3",
        });
    });

    // ── Default values ────────────────────────────────────────────────────────

    it("defaults dcvUser to 'Administrator' when the field is missing", async () => {
        dynamoMock.on(GetCommand).resolves({
            Item: {
                instanceArn: INSTANCE_ARN,
                dcvPassword: "pw",
                dcvPort: "8443",
                dcvIp: "1.2.3.4",
            },
        });

        const result = await handler({ instanceArn: INSTANCE_ARN });

        expect(result.dcvUser).toBe("Administrator");
    });

    it("defaults dcvPort to '8443' when the field is missing", async () => {
        dynamoMock.on(GetCommand).resolves({
            Item: {
                instanceArn: INSTANCE_ARN,
                dcvPassword: "pw",
                dcvUser: "Admin",
                dcvIp: "1.2.3.4",
            },
        });

        const result = await handler({ instanceArn: INSTANCE_ARN });

        expect(result.dcvPort).toBe("8443");
    });

    it("defaults dcvIp to '' when the field is missing", async () => {
        dynamoMock.on(GetCommand).resolves({
            Item: {
                instanceArn: INSTANCE_ARN,
                dcvPassword: "pw",
                dcvUser: "Admin",
                dcvPort: "8443",
            },
        });

        const result = await handler({ instanceArn: INSTANCE_ARN });

        expect(result.dcvIp).toBe("");
    });

    it("applies all three defaults when dcvUser, dcvPort, and dcvIp are all absent", async () => {
        dynamoMock.on(GetCommand).resolves({
            Item: { instanceArn: INSTANCE_ARN, dcvPassword: "pw" },
        });

        const result = await handler({ instanceArn: INSTANCE_ARN });

        expect(result).toEqual({
            dcvPassword: "pw",
            dcvUser: "Administrator",
            dcvPort: "8443",
            dcvIp: "",
        });
    });

    // ── GetItem key ───────────────────────────────────────────────────────────

    it("looks up the stream by instanceArn against the correct table", async () => {
        dynamoMock
            .on(GetCommand)
            .resolves({ Item: { instanceArn: INSTANCE_ARN, dcvPassword: "pw" } });

        await handler({ instanceArn: INSTANCE_ARN });

        const calls = dynamoMock.commandCalls(GetCommand);
        expect(calls).toHaveLength(1);
        const input = calls[0].args[0].input;
        expect(input.TableName).toBe("test-running-streams");
        expect(input.Key).toEqual({ instanceArn: INSTANCE_ARN });
    });

    // ── Error propagation ─────────────────────────────────────────────────────

    it("propagates DynamoDB errors", async () => {
        dynamoMock.on(GetCommand).rejects(new Error("ddb-get-error"));

        await expect(handler({ instanceArn: INSTANCE_ARN })).rejects.toThrow("ddb-get-error");
    });
});
