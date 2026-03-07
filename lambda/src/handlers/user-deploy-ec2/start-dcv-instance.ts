import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from "@aws-sdk/client-ssm";

type StartDcvInstanceEvent = {
    instanceId: string;
};

type StartDcvInstanceResult = {
    success: boolean;
    message: string;
};

const ssmClient = new SSMClient({ region: process.env.LAMBDA_REGION || "us-west-2" });

/**
 * Waits for an SSM command to complete and returns the result
 */
async function waitForCommand(
    commandId: string,
    instanceId: string,
    timeoutMs: number = 60000,
): Promise<{ success: boolean; output: string; error: string }> {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < timeoutMs) {
        try {
            const result = await ssmClient.send(
                new GetCommandInvocationCommand({
                    CommandId: commandId,
                    InstanceId: instanceId,
                }),
            );

            if (result.Status === "Success") {
                return {
                    success: true,
                    output: result.StandardOutputContent || "",
                    error: result.StandardErrorContent || "",
                };
            } else if (
                result.Status === "Failed" ||
                result.Status === "Cancelled" ||
                result.Status === "TimedOut"
            ) {
                return {
                    success: false,
                    output: result.StandardOutputContent || "",
                    error: result.StandardErrorContent || result.StatusDetails || "Command failed",
                };
            }
            // Still in progress, wait and retry
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
        } catch (err: unknown) {
            // InvocationDoesNotExist means the command hasn't started yet
            if (err instanceof Error && err.name === "InvocationDoesNotExist") {
                await new Promise((resolve) => setTimeout(resolve, pollInterval));
                continue;
            }
            throw err;
        }
    }

    return { success: false, output: "", error: "Command timed out" };
}

/**
 * Runs a PowerShell command on the instance via SSM
 */
async function runCommand(
    instanceId: string,
    commands: string[],
): Promise<{ success: boolean; output: string; error: string }> {
    const response = await ssmClient.send(
        new SendCommandCommand({
            InstanceIds: [instanceId],
            DocumentName: "AWS-RunPowerShellScript",
            Parameters: {
                commands: commands,
            },
            TimeoutSeconds: 60,
        }),
    );

    if (!response.Command?.CommandId) {
        throw new Error("Failed to send SSM command");
    }

    return waitForCommand(response.Command.CommandId, instanceId);
}

/**
 * Starts the DCV service on a stopped EC2 instance
 * This is a lightweight operation that just ensures DCV is running
 * without reconfiguring anything (configuration persists from initial deploy)
 */
export const handler = async (event: StartDcvInstanceEvent): Promise<StartDcvInstanceResult> => {
    console.log("Starting DCV service on instance:", event.instanceId);

    const { instanceId } = event;

    if (!instanceId) {
        throw new Error("Missing required field: instanceId");
    }

    try {
        const result = await runCommand(instanceId, [
            `$service = Get-Service -Name "DcvServer" -ErrorAction SilentlyContinue`,
            `if ($service) {`,
            `  if ($service.Status -ne "Running") {`,
            `    Start-Service -Name "DcvServer"`,
            `    Write-Host "DCV service started successfully"`,
            `  } else {`,
            `    Write-Host "DCV service already running"`,
            `  }`,
            `} else {`,
            `  Write-Host "DCV service not found, skipping start"`,
            `}`,
        ]);

        if (result.success) {
            console.log("DCV service started:", result.output);
            return {
                success: true,
                message: "DCV service started successfully",
            };
        } else {
            console.error("Failed to start DCV service:", result.error);
            return {
                success: false,
                message: result.error || "Unknown error starting DCV service",
            };
        }
    } catch (err: unknown) {
        console.error("Error starting DCV:", err);
        throw err;
    }
};
