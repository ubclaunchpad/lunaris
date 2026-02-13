"use strict";
/**
 * Lunaris EC2 Usage Telemetry Agent
 *
 * Emits SessionActiveMinute metrics to CloudWatch every 60 seconds when DCV session is active.
 * Dimensions: InstanceId, UserId, SessionId
 *
 * Run modes:
 *   - Default: runs every 60s (for systemd/cron that keeps process alive)
 *   - --once: single tick then exit (for cron * * * * *)
 *
 * Env vars:
 *   INSTANCE_ID  - override IMDS (for local dev; on EC2, fetched from IMDS)
 *   USER_ID      - required, injected via user-data at launch
 *   SESSION_ID   - required, injected via user-data at launch
 *   DCV_SESSION_ACTIVE - "true"|"false" to mock DCV (for dev; on EC2, real DCV check)
 *   AWS_REGION   - optional, defaults to us-west-2
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const METRIC_NAMESPACE = "Lunaris/Usage";
const METRIC_NAME = "SessionActiveMinute";
const TICK_INTERVAL_MS = 60_000;
const IMDS_BASE = "http://169.254.169.254/latest/meta-data";
async function getInstanceId() {
    if (process.env.INSTANCE_ID) {
        return process.env.INSTANCE_ID;
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${IMDS_BASE}/instance-id`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok)
            throw new Error(`IMDS returned ${res.status}`);
        return (await res.text()).trim();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to get InstanceId from IMDS: ${msg}`);
    }
}
function getUserId() {
    const v = process.env.USER_ID;
    if (!v)
        throw new Error("USER_ID env var is required");
    return v;
}
function getSessionId() {
    const v = process.env.SESSION_ID;
    if (!v)
        throw new Error("SESSION_ID env var is required");
    return v;
}
/**
 * Check if DCV session is active.
 * Stub: use DCV_SESSION_ACTIVE env. Replace with real dcv list-sessions check on EC2.
 */
async function checkDcvSession() {
    const mock = process.env.DCV_SESSION_ACTIVE;
    if (mock !== undefined) {
        return mock === "true" || mock === "1";
    }
    // TODO: real implementation on Windows EC2:
    // - Run: dcv list-sessions (or parse session files)
    // - Return true if any session has active connection
    return false;
}
async function emitUsageMetric(params) {
    const { instanceId, userId, sessionId, region } = params;
    const metric = {
        MetricName: METRIC_NAME,
        Dimensions: [
            { Name: "InstanceId", Value: instanceId },
            { Name: "UserId", Value: userId },
            { Name: "SessionId", Value: sessionId },
        ],
        Timestamp: new Date(),
        Unit: "Count",
        Value: 1,
    };
    const client = new client_cloudwatch_1.CloudWatchClient({ region });
    await client.send(new client_cloudwatch_1.PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [metric],
    }));
}
async function tick() {
    try {
        const dcvActive = await checkDcvSession();
        if (!dcvActive) {
            return;
        }
        const instanceId = await getInstanceId();
        const userId = getUserId();
        const sessionId = getSessionId();
        const region = process.env.AWS_REGION ?? "us-west-2";
        await emitUsageMetric({ instanceId, userId, sessionId, region });
    }
    catch (err) {
        console.error("[telemetry-agent] tick error:", err);
        // Do not rethrow - agent failure must not affect EC2 instance
    }
}
async function main() {
    const runOnce = process.argv.includes("--once");
    if (runOnce) {
        await tick();
        process.exit(0);
    }
    // Run every 60 seconds
    await tick();
    setInterval(tick, TICK_INTERVAL_MS);
}
main().catch((err) => {
    console.error("[telemetry-agent] fatal:", err);
    process.exit(1);
});
