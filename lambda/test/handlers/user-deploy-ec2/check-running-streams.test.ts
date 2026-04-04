import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-deploy-ec2/check-running-streams";
import { dynamoMock, ensureStreamsTableEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-deploy-ec2/check-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureStreamsTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    it("returns streamsRunning=false when there are no records", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: [] });

        await expect(handler({ userId: "user-123" })).resolves.toEqual({ streamsRunning: false });
    });

    it("returns streamsRunning=false when latest stream is not running", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: [{ status: "stopped" }] });

        await expect(handler({ userId: "user-123" })).resolves.toEqual({ streamsRunning: false });
    });

    it("returns streamsRunning=true when latest stream is running", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: [{ status: "running" }] });

        await expect(handler({ userId: "user-123" })).resolves.toEqual({ streamsRunning: true });
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
