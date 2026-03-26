import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { handler } from "../../../src/handlers/observability/publish-active-instances-metric";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";
import { LUNARIS_METRICS_NAMESPACE, LunarisMetricName } from "../../../src/utils/cloudWatchMetrics";

jest.mock("../../../src/utils/dynamoDbWrapper");

const cloudWatchMock = mockClient(CloudWatchClient);

describe("publish-active-instances-metric handler", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        cloudWatchMock.reset();
        process.env = { ...originalEnv, RUNNING_INSTANCES_TABLE_NAME: "RunningInstances" };
    });

    it("publishes ActiveInstances gauge from running + pending records", async () => {
        const mockWrapper = {
            queryByStatus: jest.fn((status: string) =>
                status === "running" ? Promise.resolve([{}, {}, {}]) : Promise.resolve([{}]),
            ),
        };
        (DynamoDBWrapper as unknown as jest.Mock).mockImplementation(() => mockWrapper);

        const result = await handler();

        expect(result).toEqual({ success: true, activeInstances: 4 });
        expect(mockWrapper.queryByStatus).toHaveBeenCalledWith("running");
        expect(mockWrapper.queryByStatus).toHaveBeenCalledWith("pending");

        const cmd = cloudWatchMock.call(0).args[0] as PutMetricDataCommand;
        expect(cmd.input.Namespace).toBe(LUNARIS_METRICS_NAMESPACE);
        expect(cmd.input.MetricData?.[0].MetricName).toBe(LunarisMetricName.ActiveInstances);
        expect(cmd.input.MetricData?.[0].Value).toBe(4);
    });

    it("returns error if table name is missing", async () => {
        delete process.env.RUNNING_INSTANCES_TABLE_NAME;

        const result = await handler();

        expect(result.success).toBe(false);
        expect(result.error).toContain("RUNNING_INSTANCES_TABLE_NAME");
        expect(cloudWatchMock.calls()).toHaveLength(0);
    });
});
