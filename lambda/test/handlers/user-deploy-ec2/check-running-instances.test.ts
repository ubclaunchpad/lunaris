import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-deploy-ec2/check-running-instances";
import { dynamoMock, ensureInstancesTableEnv, withEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-deploy-ec2/check-running-instances", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureInstancesTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    // ── Environment ──────────────────────────────────────────────────────────

    it("throws MissingTableNameEnv when RUNNING_INSTANCES_TABLE_NAME is not set", async () => {
        restoreEnv();
        delete process.env.RUNNING_INSTANCES_TABLE_NAME;

        await expect(handler({ userId: "user-123" })).rejects.toThrow("MissingTableNameEnv");
    });

    // ── No results ───────────────────────────────────────────────────────────

    it("returns terminated status when no items are returned from DynamoDB", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: [] });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "terminated", instanceId: "" });
    });

    it("returns terminated status when DynamoDB returns undefined Items", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: undefined });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "terminated", instanceId: "" });
    });

    // ── Full item ─────────────────────────────────────────────────────────────

    it("returns the status and instanceId from the most recent item", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ userId: "user-123", instanceId: "i-abc123", status: "running" }],
        });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "running", instanceId: "i-abc123" });
    });

    // ── Missing optional fields ───────────────────────────────────────────────

    it("defaults status to 'terminated' when the item has no status field", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ userId: "user-123", instanceId: "i-abc123" }],
        });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "terminated", instanceId: "i-abc123" });
    });

    it("defaults instanceId to '' when the item has no instanceId field", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ userId: "user-123", status: "running" }],
        });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "running", instanceId: "" });
    });

    it("returns empty string defaults when both status and instanceId are missing", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ userId: "user-123" }],
        });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "terminated", instanceId: "" });
    });

    // ── Multiple items ────────────────────────────────────────────────────────

    it("uses only the first (most recent) item when multiple are returned", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                { userId: "user-123", instanceId: "i-newest", status: "running" },
                { userId: "user-123", instanceId: "i-older", status: "stopped" },
            ],
        });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "running", instanceId: "i-newest" });
    });

    // ── Query parameters ──────────────────────────────────────────────────────

    it("queries by the correct userId against the right table", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: [] });

        await handler({ userId: "user-456" });

        const calls = dynamoMock.commandCalls(QueryCommand);
        expect(calls).toHaveLength(1);
        const input = calls[0].args[0].input;
        expect(input.TableName).toBe("test-running-instances");
        expect(input.IndexName).toBe("UserIdIndex");
        expect(input.ExpressionAttributeValues).toMatchObject({ ":userId": "user-456" });
        expect(input.ScanIndexForward).toBe(false);
    });

    // ── Error propagation ─────────────────────────────────────────────────────

    it("propagates DynamoDB errors", async () => {
        dynamoMock.on(QueryCommand).rejects(new Error("ddb-query-error"));

        await expect(handler({ userId: "user-123" })).rejects.toThrow("ddb-query-error");
    });

    // ── Statuses beyond running/terminated ────────────────────────────────────

    it("returns the raw status value for non-standard statuses (e.g. 'stopped')", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ userId: "user-123", instanceId: "i-abc", status: "stopped" }],
        });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ status: "stopped", instanceId: "i-abc" });
    });
});
