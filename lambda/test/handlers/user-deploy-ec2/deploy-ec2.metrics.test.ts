import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { handler } from "../../../src/handlers/user-deploy-ec2/deploy-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import EBSWrapper, { EBSStatusEnum } from "../../../src/utils/ebsWrapper";
import SSMWrapper from "../../../src/utils/ssmWrapper";
import {
    LunarisMetricName,
    resetCloudWatchClientForTests,
} from "../../../src/utils/cloudWatchMetrics";

jest.mock("../../../src/utils/ec2Wrapper");
jest.mock("../../../src/utils/ebsWrapper");
jest.mock("../../../src/utils/ssmWrapper");

const cwMock = mockClient(CloudWatchClient);

describe("deploy-ec2 handler CloudWatch metrics", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        cwMock.reset();
        resetCloudWatchClientForTests();
        process.env = { ...originalEnv, LAMBDA_REGION: "us-east-1" };
        process.env.SECURITY_GROUP_ID = "sg-test";
        process.env.SUBNET_ID = "subnet-test";
        process.env.EC2_INSTANCE_PROFILE_NAME = "lunaris-profile";
        process.env.BASE_EBS_SNAPSHOT_ID = "snap-123";
    });

    afterEach(() => {
        process.env = originalEnv;
        resetCloudWatchClientForTests();
    });

    it("publishes Started and Succeeded on successful deploy (realtime fleet count is published after RunningInstances update)", async () => {
        const mockSSM = {
            getParamFromParamStore: jest.fn<() => Promise<string>>().mockResolvedValue("ami-abc"),
        };
        const mockEC2 = {
            createAndWaitForInstance: jest.fn().mockResolvedValue({
                instanceId: "i-abc",
                instanceArn: "arn:aws:ec2:us-east-1:123456789012:instance/i-abc",
                publicIp: "1.2.3.4",
                availabilityZone: "us-east-1a",
            }),
        };
        const mockEBS = {
            createAndWaitForEBSVolume: jest.fn().mockResolvedValue({
                volumeId: "vol-abc",
                status: EBSStatusEnum.AVAILABLE,
            }),
            attachAndWaitForEBSVolume: jest.fn().mockResolvedValue({
                volumeId: "vol-abc",
                status: EBSStatusEnum.IN_USE,
            }),
        };
        (SSMWrapper as unknown as jest.Mock).mockImplementation(
            () => mockSSM as unknown as SSMWrapper,
        );
        (EC2Wrapper as unknown as jest.Mock).mockImplementation(
            () => mockEC2 as unknown as EC2Wrapper,
        );
        (EBSWrapper as unknown as jest.Mock).mockImplementation(
            () => mockEBS as unknown as EBSWrapper,
        );

        const result = await handler({ userId: "user-1" });

        expect(result.success).toBe(true);

        const metricNames = cwMock.calls().map((call) => {
            const cmd = call.args[0] as PutMetricDataCommand;
            return cmd.input.MetricData![0].MetricName;
        });

        expect(metricNames).toEqual([
            LunarisMetricName.DeploymentsStarted,
            LunarisMetricName.DeploymentsSucceeded,
        ]);
    });

    it("publishes Started and Failed when deployment throws", async () => {
        const mockSSM = {
            getParamFromParamStore: jest.fn<() => Promise<string>>().mockResolvedValue("ami-abc"),
        };
        const mockEC2 = {
            createAndWaitForInstance: jest
                .fn()
                .mockRejectedValue(new Error("Instance limit exceeded")),
        };
        const mockEBS = {
            createAndWaitForEBSVolume: jest.fn(),
            attachAndWaitForEBSVolume: jest.fn(),
        };
        (SSMWrapper as unknown as jest.Mock).mockImplementation(
            () => mockSSM as unknown as SSMWrapper,
        );
        (EC2Wrapper as unknown as jest.Mock).mockImplementation(
            () => mockEC2 as unknown as EC2Wrapper,
        );
        (EBSWrapper as unknown as jest.Mock).mockImplementation(
            () => mockEBS as unknown as EBSWrapper,
        );

        const result = await handler({ userId: "user-1" });

        expect(result.success).toBe(false);

        const metricNames = cwMock.calls().map((call) => {
            const cmd = call.args[0] as PutMetricDataCommand;
            return cmd.input.MetricData![0].MetricName;
        });

        expect(metricNames).toEqual([
            LunarisMetricName.DeploymentsStarted,
            LunarisMetricName.DeploymentsFailed,
        ]);
    });
});
