import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";
import { handler } from "../../../src/handlers/user-deploy-ec2/update-running-instances";
import { DEFAULT_INSTANCE_TYPE } from "../../../src/utils/ec2Wrapper";
import {
    LunarisMetricName,
    resetCloudWatchClientForTests,
} from "../../../src/utils/cloudWatchMetrics";
import { withEnv } from "../../utils/dynamoMock";

jest.mock("../../../src/utils/dynamoDbWrapper");
jest.mock("../../../src/utils/ec2Wrapper", () => ({
    ...jest.requireActual("../../../src/utils/ec2Wrapper"),
    default: jest.fn(),
}));

const cwMock = mockClient(CloudWatchClient);

const BASE_EVENT = {
    instanceId: "i-0abc123def456789",
    instanceArn: "arn:aws:ec2:us-west-2:111122223333:instance/i-0abc123def456789",
    userId: "user-123",
    creationTime: "2024-01-15T10:00:00.000Z",
};

describe("user-deploy-ec2/update-running-instances", () => {
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
            status === "running" ? Promise.resolve([{}, {}]) : Promise.resolve([{}]),
        );

        restoreEnv = withEnv({
            RUNNING_INSTANCES_TABLE_NAME: "test-running-instances",
            LAMBDA_REGION: "us-west-2",
        });
    });

    afterEach(() => {
        restoreEnv();
        resetCloudWatchClientForTests();
    });

    // ── Environment ───────────────────────────────────────────────────────────

    it("throws MissingTableNameEnv when RUNNING_INSTANCES_TABLE_NAME is not set", async () => {
        restoreEnv();
        delete process.env.RUNNING_INSTANCES_TABLE_NAME;
        restoreEnv = withEnv({ LAMBDA_REGION: "us-west-2" });

        await expect(handler(BASE_EVENT)).rejects.toThrow("MissingTableNameEnv");
    });

    // ── Input validation ──────────────────────────────────────────────────────

    it("throws when instanceArn is missing", async () => {
        await expect(handler({ ...BASE_EVENT, instanceArn: "" })).rejects.toThrow(
            "Missing required fields: instanceArn, instanceId",
        );
    });

    it("throws when instanceId is missing", async () => {
        await expect(handler({ ...BASE_EVENT, instanceId: "" })).rejects.toThrow(
            "Missing required fields: instanceArn, instanceId",
        );
    });

    it("throws when both instanceArn and instanceId are missing", async () => {
        await expect(handler({ ...BASE_EVENT, instanceArn: "", instanceId: "" })).rejects.toThrow(
            "Missing required fields: instanceArn, instanceId",
        );
    });

    // ── Success path ──────────────────────────────────────────────────────────

    it("returns success:true and the instanceId on a valid event", async () => {
        const result = await handler(BASE_EVENT);

        expect(result).toEqual({ success: true, instanceId: BASE_EVENT.instanceId });
    });

    it("publishes ActiveInstancesRealtime after the RunningInstances row is updated", async () => {
        await handler(BASE_EVENT);

        expect(mockDynamoDBWrapper.updateItem).toHaveBeenCalledTimes(1);
        expect(mockDynamoDBWrapper.queryByStatus).toHaveBeenCalledWith("running");
        expect(mockDynamoDBWrapper.queryByStatus).toHaveBeenCalledWith("pending");

        expect(cwMock.calls()).toHaveLength(1);
        const cmd = cwMock.call(0).args[0] as PutMetricDataCommand;
        expect(cmd.input.MetricData?.[0].MetricName).toBe(
            LunarisMetricName.ActiveInstancesRealtime,
        );
        expect(cmd.input.MetricData?.[0].Value).toBe(3);
    });

    it("constructs DynamoDBWrapper with the table name from the environment", async () => {
        await handler(BASE_EVENT);

        expect(DynamoDBWrapper).toHaveBeenCalledWith("test-running-instances");
    });

    // ── updateItem call arguments ─────────────────────────────────────────────

    it("calls updateItem once with the correct Key", async () => {
        await handler(BASE_EVENT);

        expect(mockDynamoDBWrapper.updateItem).toHaveBeenCalledTimes(1);
        const key = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][0] as Record<
            string,
            unknown
        >;
        expect(key).toEqual({ instanceId: BASE_EVENT.instanceId });
    });

    it("sets status to 'running' in the ExpressionAttributeValues", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(eav[":status"]).toBe("running");
    });

    it("sets instanceType to DEFAULT_INSTANCE_TYPE in the ExpressionAttributeValues", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(eav[":instanceType"]).toBe(DEFAULT_INSTANCE_TYPE);
    });

    it("sets instanceArn, userId and creationTime from the event in ExpressionAttributeValues", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(eav[":instanceArn"]).toBe(BASE_EVENT.instanceArn);
        expect(eav[":userId"]).toBe(BASE_EVENT.userId);
        expect(eav[":creationTime"]).toBe(BASE_EVENT.creationTime);
    });

    it("sets a string lastModifiedTime in ExpressionAttributeValues", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(typeof eav[":lastModifiedTime"]).toBe("string");
        expect(eav[":lastModifiedTime"]).toBeTruthy();
    });

    it("uses 'if_not_exists' for creationTime in the UpdateExpression", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        expect(options.UpdateExpression).toContain("if_not_exists(creationTime");
    });

    it("aliases status and region via ExpressionAttributeNames to avoid reserved word conflicts", async () => {
        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const ean = options.ExpressionAttributeNames as Record<string, string>;
        expect(ean["#status"]).toBe("status");
        expect(ean["#region"]).toBe("region");
    });

    // ── Region handling ───────────────────────────────────────────────────────

    it("uses LAMBDA_REGION in the region ExpressionAttributeValue when set", async () => {
        restoreEnv();
        restoreEnv = withEnv({
            RUNNING_INSTANCES_TABLE_NAME: "test-running-instances",
            LAMBDA_REGION: "eu-central-1",
        });

        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(eav[":region"]).toBe("eu-central-1");
    });

    it("defaults region to 'us-west-2' when LAMBDA_REGION is not set", async () => {
        restoreEnv();
        restoreEnv = withEnv({
            RUNNING_INSTANCES_TABLE_NAME: "test-running-instances",
            LAMBDA_REGION: undefined,
        });

        await handler(BASE_EVENT);

        const options = (mockDynamoDBWrapper.updateItem as jest.Mock).mock.calls[0][1] as Record<
            string,
            unknown
        >;
        const eav = options.ExpressionAttributeValues as Record<string, string>;
        expect(eav[":region"]).toBe("us-west-2");
    });

    // ── Error propagation ─────────────────────────────────────────────────────

    it("re-throws DynamoDB errors", async () => {
        mockDynamoDBWrapper.updateItem = jest.fn().mockRejectedValue(new Error("ddb-update-error"));

        await expect(handler(BASE_EVENT)).rejects.toThrow("ddb-update-error");
    });
});
