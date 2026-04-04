import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";

/** Custom metrics namespace for Lunaris operational visibility */
export const LUNARIS_METRICS_NAMESPACE = "Lunaris";

export const LunarisMetricName = {
    /** DynamoDB count published on deploy/terminate (event-sampled “live” gauge). */
    ActiveInstancesRealtime: "ActiveInstancesRealtime",
    /** DynamoDB count published on a schedule (periodic reconciler / source of truth). */
    ActiveInstancesReconciled: "ActiveInstancesReconciled",
    DeploymentsStarted: "DeploymentsStarted",
    DeploymentsSucceeded: "DeploymentsSucceeded",
    DeploymentsFailed: "DeploymentsFailed",
    AverageSessionDuration: "AverageSessionDuration",
    TotalCostEstimate: "TotalCostEstimate",
} as const;

function metricRegion(): string {
    return process.env.AWS_REGION ?? process.env.LAMBDA_REGION ?? "us-east-1";
}

let client: CloudWatchClient | undefined;

function getClient(): CloudWatchClient {
    if (!client) {
        client = new CloudWatchClient({ region: metricRegion() });
    }
    return client;
}

/** Exposed for unit tests only */
export function resetCloudWatchClientForTests(): void {
    client = undefined;
}

async function putCountMetric(
    metricName: string,
    value: number,
    cw?: CloudWatchClient,
): Promise<void> {
    const c = cw ?? getClient();
    await c.send(
        new PutMetricDataCommand({
            Namespace: LUNARIS_METRICS_NAMESPACE,
            MetricData: [
                {
                    MetricName: metricName,
                    Value: value,
                    Unit: StandardUnit.Count,
                    Timestamp: new Date(),
                },
            ],
        }),
    );
}

async function putNumericMetric(
    metricName: string,
    value: number,
    unit: StandardUnit,
    cw?: CloudWatchClient,
): Promise<void> {
    const c = cw ?? getClient();
    await c.send(
        new PutMetricDataCommand({
            Namespace: LUNARIS_METRICS_NAMESPACE,
            MetricData: [
                {
                    MetricName: metricName,
                    Value: value,
                    Unit: unit,
                    Timestamp: new Date(),
                },
            ],
        }),
    );
}

async function putCountMetricSafe(
    metricName: string,
    value: number,
    cw?: CloudWatchClient,
): Promise<void> {
    try {
        await putCountMetric(metricName, value, cw);
    } catch (err: unknown) {
        console.error(`CloudWatch PutMetricData failed (${metricName}):`, err);
    }
}

async function putNumericMetricSafe(
    metricName: string,
    value: number,
    unit: StandardUnit,
    cw?: CloudWatchClient,
): Promise<void> {
    try {
        await putNumericMetric(metricName, value, unit, cw);
    } catch (err: unknown) {
        console.error(`CloudWatch PutMetricData failed (${metricName}):`, err);
    }
}

export async function publishDeploymentStarted(cw?: CloudWatchClient): Promise<void> {
    await putCountMetricSafe(LunarisMetricName.DeploymentsStarted, 1, cw);
}

export async function publishDeploymentSucceeded(cw?: CloudWatchClient): Promise<void> {
    await putCountMetricSafe(LunarisMetricName.DeploymentsSucceeded, 1, cw);
}

export async function publishDeploymentFailed(cw?: CloudWatchClient): Promise<void> {
    await putCountMetricSafe(LunarisMetricName.DeploymentsFailed, 1, cw);
}

export async function publishActiveInstancesRealtimeCount(
    count: number,
    cw?: CloudWatchClient,
): Promise<void> {
    if (!Number.isFinite(count) || count < 0) return;
    await putCountMetricSafe(LunarisMetricName.ActiveInstancesRealtime, count, cw);
}

export async function publishActiveInstancesReconciledCount(
    count: number,
    cw?: CloudWatchClient,
): Promise<void> {
    if (!Number.isFinite(count) || count < 0) return;
    await putCountMetricSafe(LunarisMetricName.ActiveInstancesReconciled, count, cw);
}

export async function publishAverageSessionDuration(
    minutes: number,
    cw?: CloudWatchClient,
): Promise<void> {
    if (!Number.isFinite(minutes) || minutes < 0) return;
    await putNumericMetricSafe(
        LunarisMetricName.AverageSessionDuration,
        minutes,
        StandardUnit.None,
        cw,
    );
}

export async function publishTotalCostEstimate(
    costUsd: number,
    cw?: CloudWatchClient,
): Promise<void> {
    if (!Number.isFinite(costUsd) || costUsd < 0) return;
    await putNumericMetricSafe(LunarisMetricName.TotalCostEstimate, costUsd, StandardUnit.None, cw);
}
