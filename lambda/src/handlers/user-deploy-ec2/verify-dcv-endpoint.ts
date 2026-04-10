import https from "https";
import EC2Wrapper from "../../utils/ec2Wrapper";

type VerifyDcvEndpointEvent = {
    instanceId: string;
    dcvPort?: number | string;
    timeoutSeconds?: number;
    pollIntervalSeconds?: number;
};

type VerifyDcvEndpointResult = {
    success: true;
    dcvIp: string;
    dcvPort: number;
    streamingLink: string;
    attempts: number;
    verifiedAt: string;
    statusCode: number;
};

const DEFAULT_TIMEOUT_SECONDS = 360;
const DEFAULT_POLL_INTERVAL_SECONDS = 15;
const REQUEST_TIMEOUT_MS = 8000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildStreamingHost(dcvIp: string): string {
    return `${dcvIp.replace(/\./g, "-")}.nip.io`;
}

function verifyHttpsEndpoint(hostname: string, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = https.request(
            {
                hostname,
                port,
                path: "/",
                method: "GET",
                rejectUnauthorized: false,
                servername: hostname,
                agent: false,
                timeout: REQUEST_TIMEOUT_MS,
            },
            (response) => {
                const statusCode = response.statusCode ?? 0;
                response.resume();
                resolve(statusCode);
            },
        );

        request.on("timeout", () => {
            request.destroy(new Error("Endpoint verification timed out"));
        });
        request.on("error", reject);
        request.end();
    });
}

export const handler = async (
    event: VerifyDcvEndpointEvent,
): Promise<VerifyDcvEndpointResult> => {
    const { instanceId } = event;
    const dcvPort =
        typeof event.dcvPort === "string" ? Number(event.dcvPort) : (event.dcvPort ?? 8443);
    const timeoutSeconds = event.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    const pollIntervalSeconds = event.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;

    if (!instanceId) {
        throw new Error("Missing required field: instanceId");
    }

    const ec2Wrapper = new EC2Wrapper(process.env.LAMBDA_REGION || process.env.AWS_REGION || "us-west-2");
    const deadline = Date.now() + timeoutSeconds * 1000;
    let attempts = 0;
    let lastError = "DCV endpoint has not been verified yet";

    while (Date.now() < deadline) {
        attempts += 1;

        const instanceDetails = await ec2Wrapper.getInstanceDetails(instanceId);
        const state = instanceDetails.state || "unknown";

        if (state === "terminated" || state === "shutting-down" || state === "stopped") {
            throw new Error(`DCV instance entered unexpected state: ${state}`);
        }

        if (state !== "running") {
            lastError = `EC2 instance is not running yet (state: ${state})`;
            await sleep(pollIntervalSeconds * 1000);
            continue;
        }

        const dcvIp = instanceDetails.publicIp;
        if (!dcvIp) {
            lastError = "EC2 instance does not have a public IP yet";
            await sleep(pollIntervalSeconds * 1000);
            continue;
        }

        // Verify connectivity using raw IP — avoids any nip.io DNS dependency during the check.
        // The streaming link still uses the nip.io hostname so the browser gets a clean hostname
        // for TLS (and for any Let's Encrypt cert installed by user-data).
        const nipHostname = buildStreamingHost(dcvIp);
        try {
            const statusCode = await verifyHttpsEndpoint(dcvIp, dcvPort);
            return {
                success: true,
                dcvIp,
                dcvPort,
                streamingLink: `https://${nipHostname}:${dcvPort}`,
                attempts,
                verifiedAt: new Date().toISOString(),
                statusCode,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            console.warn(
                `DCV endpoint verification attempt ${attempts} failed for ${dcvIp}:${dcvPort}: ${lastError}`,
            );
            await sleep(pollIntervalSeconds * 1000);
        }
    }

    throw new Error(`DCV endpoint did not become ready within ${timeoutSeconds}s: ${lastError}`);
};
