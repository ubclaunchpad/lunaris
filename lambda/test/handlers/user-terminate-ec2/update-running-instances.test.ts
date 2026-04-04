import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { handler } from "../../../src/handlers/user-terminate-ec2/update-running-instances";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";
import {
    LunarisMetricName,
    resetCloudWatchClientForTests,
} from "../../../src/utils/cloudWatchMetrics";
import { withEnv } from "../../utils/dynamoMock";

jest.mock("../../../src/utils/dynamoDbWrapper");

const cwMock = mockClient(CloudWatchClient);

const BASE_EVENT = {
    instanceId: "i-0abc123def456789",
    status: "stopped",
};

describe("user-terminate-ec2/update-running-instances", () => {
    let mockDynamoDBWrapper: jest.Mocked<DynamoDBWrapper>;
    let restoreEnv: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        cwMock.reset();
        resetCloudWatchClientForTests();

        mockDynamoDBWrapper = new DynamoDBWrapper("test") as jest.Mocked<DynamoDBWrapper>;
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockDynamoDBWrapper,
        );
        mockDynamoDBWrapper.updateItem = jest.fn().mockResolvedValue(undefined);
        mockDynamoDBWrapper.queryByStatus = jest.fn((status: string) =>
            status === "running" ? Promise.resolve([{}]) : Promise.resolve([{}]),
        );

        restoreEnv = withEnv({ RUNNING_INSTANCES_TABLE_NAME: "test-running-instances" });
    });

    afterEach(() => {
        restoreEnv();
        resetCloudWatchClientForTests();
    });

    // ── Environment ───────────────────────────────────────────────────────────

    it("throws MissingTableNameEnv when RUNNING_INSTANCES_TABLE_NAME is not set", async () => {
        restoreEnv();
        delete process.env.RUNNING_INSTANCES_TABLE_NAME;

        await expect(handler(BASE_EVENT)).rejects.toThrow("MissingTableNameEnv");
    });

    // ── Input validation ──────────────────────────────────────────────────────

    it("throws when instanceId is missing", async () => {
        await expect(handler({ ...BASE_EVENT, instanceId: "" })).rejects.toThrow(
            "Missing required fields: instanceId, status",
        );
    });

    it("throws when status is missing", async () => {
        await expect(handler({ ...BASE_EVENT, status: "" })).rejects.toThrow(
            "Missing required fields: instanceId, status",
        );
    });

    it("throws when both instanceId and status are missing", async () => {
        await expect(handler({ instanceId: "", status: "" })).rejects.toThrow(
            "Missing required fields: instanceId, status",
        );
    });

    // ── Success path ──────────────────────────────────────────────────────────

    it("returns { success: true, instanceId } on a valid event", async () => {
        const result = await handler(BASE_EVENT);

        expect(result).toEqual({ success: true, instanceId: BASE_EVENT.instanceId });
    });

    it("publishes ActiveInstancesRealtime after RunningInstances is set to stopped", async () => {
        await handler(BASE_EVENT);

        expect(cwMock.calls()).toHaveLength(1);
        const cmd = cwMock.call(0).args[0] as PutMetricDataCommand;
        expect(cmd.input.MetricData?.[0].MetricName).toBe(
            LunarisMetricName.ActiveInstancesRealtime,
        );
        expect(cmd.input.MetricData?.[0].Value).toBe(2);
    });

    it("constructs DynamoDBWrapper with the table name from the environment", async () => {
        await handler(BASE_EVENT);

        expect(DynamoDBWrapper).toHaveBeenCalledWith("test-running-instances");
    });

    // ── updateItem call arguments ─────────────────────────────────────────────

    it("calls updateItem exactly once with the correct Key", async () => {
        await handler(BASE_EVENT);

        expect(mockDynamoDBWrapper.updateItem).toHaveBeenCalledTimes(1);
        const key = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][0] as Record<
            string,
            unknown
        >;
        expect(key).toEqual({ instanceId: BASE_EVENT.instanceId });
    });

    it("sets status to stopped in ExpressionAttributeValues", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(eav[":status"]).toBe("stopped");
    });

    it("always persists stopped status regardless of event status value", async () => {
        await handler({ ...BASE_EVENT, status: "terminated" });

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(eav[":status"]).toBe("stopped");
    });

    it("sets a non-empty string lastModifiedTime in ExpressionAttributeValues", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(typeof eav[":lastModifiedTime"]).toBe("string");
        expect(eav[":lastModifiedTime"]).toBeTruthy();
    });

    it("aliases #status to 'status' via ExpressionAttributeNames to avoid reserved-word conflicts", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const ean = options.ExpressionAttributeNames as Record<string, string>;
        expect(ean["#status"]).toBe("status");
    });

    // ── Error propagation ─────────────────────────────────────────────────────

    it("re-throws DynamoDB errors", async () => {
        mockDynamoDBWrapper.updateItem = jest.fn().mockRejectedValue(new Error("ddb-update-error"));

        await expect(handler(BASE_EVENT)).rejects.toThrow("ddb-update-error");
    });
});
