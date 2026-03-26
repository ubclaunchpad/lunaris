import {
    CloudWatchClient,
    PutMetricDataCommand,
    StandardUnit,
} from "@aws-sdk/client-cloudwatch";

/** Custom metrics namespace for Lunaris operational visibility */
export const LUNARIS_METRICS_NAMESPACE = "Lunaris";

export const LunarisMetricName = {
    ActiveInstances: "ActiveInstances",
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

async function putCountMetric(metricName: string, value: number, cw?: CloudWatchClient): Promise<void> {
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

async function putCountMetricSafe(metricName: string, value: number, cw?: CloudWatchClient): Promise<void> {
    try {
        await putCountMetric(metricName, value, cw);
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

/**
 * Delta for fleet changes (+1 deploy, -1 terminate). True “current running” count for alarms
 * usually needs a periodic reconciler publishing an absolute gauge, or matching math on this metric.
 */
export async function publishActiveInstancesDelta(delta: number, cw?: CloudWatchClient): Promise<void> {
    if (delta === 0) return;
    await putCountMetricSafe(LunarisMetricName.ActiveInstances, delta, cw);
}
