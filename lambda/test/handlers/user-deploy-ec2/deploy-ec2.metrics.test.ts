import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { handler } from "../../../src/handlers/user-deploy-ec2/deploy-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import {
    LunarisMetricName,
    resetCloudWatchClientForTests,
} from "../../../src/utils/cloudWatchMetrics";

jest.mock("../../../src/utils/ec2Wrapper");

const cwMock = mockClient(CloudWatchClient);

const BASE_EVENT = {
    userId: "user-1",
    gameId: "game-fortnite",
    amiId: "ami-abc",
    instanceType: "g4dn.xlarge",
};

describe("deploy-ec2 handler CloudWatch metrics", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        cwMock.reset();
        resetCloudWatchClientForTests();
        process.env = {
            ...originalEnv,
            LAMBDA_REGION: "us-east-1",
            SECURITY_GROUP_ID: "sg-test",
            SUBNET_ID: "subnet-test",
            EC2_INSTANCE_PROFILE_NAME: "lunaris-profile",
        };
    });

    afterEach(() => {
        process.env = originalEnv;
        resetCloudWatchClientForTests();
    });

    it("publishes Started and Succeeded on successful deploy", async () => {
        const mockEC2 = {
            createAndWaitForInstance: jest.fn().mockResolvedValue({
                instanceId: "i-abc",
                instanceArn: "arn:aws:ec2:us-east-1:123456789012:instance/i-abc",
                publicIp: "1.2.3.4",
                availabilityZone: "us-east-1a",
                state: "running",
                createdAt: new Date().toISOString(),
            }),
        };
        (EC2Wrapper as unknown as jest.Mock).mockImplementation(
            () => mockEC2 as unknown as EC2Wrapper,
        );

        const result = await handler(BASE_EVENT);

        expect(result.success).toBe(true);

        const metricNames = cwMock.calls().map((call) => {
            const cmd = call.args[0] as PutMetricDataCommand;
            return cmd.input.MetricData![0].MetricName;
        });

        expect(metricNames).toEqual([
            LunarisMetricName.DeploymentsStarted,
            LunarisMetricName.DeploymentsSucceeded,
            LunarisMetricName.ActiveInstancesRealtime,
        ]);
    });

    it("publishes Started and Failed when deployment throws", async () => {
        const mockEC2 = {
            createAndWaitForInstance: jest
                .fn()
                .mockRejectedValue(new Error("Instance limit exceeded")),
        };
        (EC2Wrapper as unknown as jest.Mock).mockImplementation(
            () => mockEC2 as unknown as EC2Wrapper,
        );

        const result = await handler(BASE_EVENT);

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
