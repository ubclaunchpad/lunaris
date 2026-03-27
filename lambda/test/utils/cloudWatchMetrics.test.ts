import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import {
    LUNARIS_METRICS_NAMESPACE,
    LunarisMetricName,
    publishActiveInstancesDelta,
    publishAverageSessionDuration,
    publishDeploymentFailed,
    publishDeploymentStarted,
    publishDeploymentSucceeded,
    publishTotalCostEstimate,
    resetCloudWatchClientForTests,
} from "../../src/utils/cloudWatchMetrics";

const cwMock = mockClient(CloudWatchClient);

describe("cloudWatchMetrics", () => {
    beforeEach(() => {
        cwMock.reset();
        resetCloudWatchClientForTests();
    });

    afterEach(() => {
        resetCloudWatchClientForTests();
    });

    it("publishDeploymentStarted sends PutMetricData with DeploymentsStarted", async () => {
        await publishDeploymentStarted();

        expect(cwMock.calls()).toHaveLength(1);
        const call = cwMock.call(0);
        expect(call.args[0]).toBeInstanceOf(PutMetricDataCommand);
        const input = (call.args[0] as PutMetricDataCommand).input;
        expect(input.Namespace).toBe(LUNARIS_METRICS_NAMESPACE);
        expect(input.MetricData).toHaveLength(1);
        expect(input.MetricData![0].MetricName).toBe(LunarisMetricName.DeploymentsStarted);
        expect(input.MetricData![0].Value).toBe(1);
    });

    it("publishDeploymentSucceeded sends DeploymentsSucceeded", async () => {
        await publishDeploymentSucceeded();
        const input = (cwMock.call(0).args[0] as PutMetricDataCommand).input;
        expect(input.MetricData![0].MetricName).toBe(LunarisMetricName.DeploymentsSucceeded);
    });

    it("publishDeploymentFailed sends DeploymentsFailed", async () => {
        await publishDeploymentFailed();
        const input = (cwMock.call(0).args[0] as PutMetricDataCommand).input;
        expect(input.MetricData![0].MetricName).toBe(LunarisMetricName.DeploymentsFailed);
    });

    it("publishActiveInstancesDelta skips when delta is 0", async () => {
        await publishActiveInstancesDelta(0);
        expect(cwMock.calls()).toHaveLength(0);
    });

    it("publishActiveInstancesDelta sends ActiveInstances with given delta", async () => {
        await publishActiveInstancesDelta(-1);
        const input = (cwMock.call(0).args[0] as PutMetricDataCommand).input;
        expect(input.MetricData![0].MetricName).toBe(LunarisMetricName.ActiveInstances);
        expect(input.MetricData![0].Value).toBe(-1);
    });

    it("publishAverageSessionDuration sends minutes metric", async () => {
        await publishAverageSessionDuration(42.5);
        const input = (cwMock.call(0).args[0] as PutMetricDataCommand).input;
        expect(input.MetricData![0].MetricName).toBe(LunarisMetricName.AverageSessionDuration);
        expect(input.MetricData![0].Value).toBe(42.5);
    });

    it("publishTotalCostEstimate sends cost metric", async () => {
        await publishTotalCostEstimate(1.2345);
        const input = (cwMock.call(0).args[0] as PutMetricDataCommand).input;
        expect(input.MetricData![0].MetricName).toBe(LunarisMetricName.TotalCostEstimate);
        expect(input.MetricData![0].Value).toBe(1.2345);
    });

    it("swallows errors from PutMetricData and logs", async () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        cwMock.on(PutMetricDataCommand).rejects(new Error("throttled"));

        await expect(publishDeploymentStarted()).resolves.toBeUndefined();

        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });
});
