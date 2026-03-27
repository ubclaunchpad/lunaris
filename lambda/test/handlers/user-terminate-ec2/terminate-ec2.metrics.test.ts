import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { handler } from "../../../src/handlers/user-terminate-ec2/terminate-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import EBSWrapper from "../../../src/utils/ebsWrapper";
import DCVWrapper from "../../../src/utils/dcvWrapper";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";
import {
    LunarisMetricName,
    resetCloudWatchClientForTests,
} from "../../../src/utils/cloudWatchMetrics";

jest.mock("../../../src/utils/ec2Wrapper");
jest.mock("../../../src/utils/ebsWrapper");
jest.mock("../../../src/utils/dcvWrapper");
jest.mock("../../../src/utils/dynamoDbWrapper");

const cwMock = mockClient(CloudWatchClient);

describe("terminate-ec2 handler CloudWatch metrics", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        cwMock.reset();
        resetCloudWatchClientForTests();
        process.env = { ...originalEnv, RUNNING_INSTANCES_TABLE_NAME: "RunningInstances" };
    });

    afterEach(() => {
        process.env = originalEnv;
        resetCloudWatchClientForTests();
    });

    it("publishes active-instance delta, session duration, and cost on successful terminate", async () => {
        const mockEC2 = {
            getInstanceDetails: (jest.fn() as jest.Mock).mockResolvedValue({
                volumes: [{ volumeId: "vol-1" }],
            } as never),
            terminateInstance: (jest.fn() as jest.Mock).mockResolvedValue({
                state: "shutting-down",
            } as never),
        };
        const mockEBS = {
            detachEBSVolume: (jest.fn() as jest.Mock).mockResolvedValue({ state: "detached" } as never),
        };
        const mockDCV = {
            stopDCVSession: (jest.fn() as jest.Mock).mockResolvedValue(
                { stoppedSuccessfully: true } as never,
            ),
        };
        const mockDynamo = {
            getItem: (jest.fn() as jest.Mock).mockResolvedValue({
                instanceId: "i-123",
                creationTime: "2026-01-01T00:00:00.000Z",
                instanceType: "t3.small",
            } as never),
            updateItem: (jest.fn() as jest.Mock).mockResolvedValue(undefined as never),
        };

        (EC2Wrapper as unknown as jest.Mock).mockImplementation(() => mockEC2 as unknown as EC2Wrapper);
        (EBSWrapper as unknown as jest.Mock).mockImplementation(() => mockEBS as unknown as EBSWrapper);
        (DCVWrapper as unknown as jest.Mock).mockImplementation(() => mockDCV as unknown as DCVWrapper);
        (DynamoDBWrapper as unknown as jest.Mock).mockImplementation(
            () => mockDynamo as unknown as DynamoDBWrapper,
        );

        const result = await handler({
            userId: "user-1",
            instanceId: "i-123",
            instanceArn: "arn:aws:ec2:us-east-1:123456789012:instance/i-123",
        });

        expect(result.success).toBe(true);
        expect(cwMock.calls().length).toBeGreaterThanOrEqual(3);
        const metricNames = cwMock.calls().map((call) => {
            const cmd = call.args[0] as PutMetricDataCommand;
            return cmd.input.MetricData?.[0].MetricName;
        });
        expect(metricNames).toContain(LunarisMetricName.ActiveInstances);
        expect(metricNames).toContain(LunarisMetricName.AverageSessionDuration);
        expect(metricNames).toContain(LunarisMetricName.TotalCostEstimate);

        const activeDeltaCall = cwMock
            .calls()
            .find(
                (call) =>
                    (call.args[0] as PutMetricDataCommand).input.MetricData?.[0].MetricName ===
                    LunarisMetricName.ActiveInstances,
            );
        expect(activeDeltaCall).toBeDefined();
        expect((activeDeltaCall!.args[0] as PutMetricDataCommand).input.MetricData?.[0].Value).toBe(-1);
    });
});
