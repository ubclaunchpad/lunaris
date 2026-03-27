import EC2Wrapper from "../../utils/ec2Wrapper";
import EBSWrapper from "../../utils/ebsWrapper";
import DCVWrapper from "../../utils/dcvWrapper";
import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import {
    publishActiveInstancesDelta,
    publishAverageSessionDuration,
    publishTotalCostEstimate,
} from "../../utils/cloudWatchMetrics";

const INSTANCE_HOURLY_COST_USD: Record<string, number> = {
    "t3.small": 0.0208,
};

type RunningInstanceRecord = {
    creationTime?: string;
    instanceType?: string;
};

function getSessionDurationMinutes(creationTime: string, endedAt: Date): number | undefined {
    const startedAtMs = Date.parse(creationTime);
    if (Number.isNaN(startedAtMs)) return undefined;
    const minutes = (endedAt.getTime() - startedAtMs) / (1000 * 60);
    return minutes >= 0 ? minutes : undefined;
}

function estimateSessionCostUsd(instanceType: string, sessionMinutes: number): number | undefined {
    const hourlyCost = INSTANCE_HOURLY_COST_USD[instanceType];
    if (hourlyCost === undefined) return undefined;
    const cost = (sessionMinutes / 60) * hourlyCost;
    return Math.round(cost * 10000) / 10000;
}

export interface TerminateEc2Event {
    userId: string;
    instanceId: string;
    instanceArn: string;
}

export interface TerminateEc2Result {
    success: boolean;
    instanceId?: string;
    dcvStopped?: boolean;
    detachVolumeState?: string;
    terminateInstanceState?: string;
    dynamoDbUpdateStatus?: string;
    message?: string;
    error?: string;
}

async function terminateWorkflow(
    instanceId: string,
    userId: string,
    runningInstancesTable: DynamoDBWrapper,
) {
    const dcvWrapper = new DCVWrapper(instanceId, userId);
    const ebsWrapper = new EBSWrapper();
    const ec2Wrapper = new EC2Wrapper();

    let dcvResult = { stoppedSuccessfully: false, message: "DCV stop skipped" };
    let detachResult = { state: "skipped" };

    try {
        // Get instance details to find volume
        const instanceDetails = await ec2Wrapper.getInstanceDetails(instanceId);
        const volumeId = instanceDetails.volumes[0]?.volumeId;

        // Stop DCV session (best effort - don't fail if it doesn't work)
        try {
            dcvResult = await dcvWrapper.stopDCVSession();
        } catch (dcvError) {
            console.warn("Failed to stop DCV session:", dcvError);
        }

        // Detach EBS volume if found (best effort for MVP)
        if (volumeId) {
            try {
                detachResult = await ebsWrapper.detachEBSVolume(volumeId, instanceId);
            } catch (detachError) {
                console.warn("Failed to detach volume:", detachError);
            }
        }
    } catch (detailsError) {
        console.warn("Failed to get instance details:", detailsError);
    }

    // Terminate EC2 instance - don't wait for full termination to avoid Lambda timeout
    // The instance will terminate in the background after the Lambda returns
    const terminateResult = await ec2Wrapper.terminateInstance(instanceId);

    // Update DynamoDB table (best effort - don't fail if record doesn't exist)
    let dynamoDbUpdateStatus = "skipped";
    try {
        await runningInstancesTable.updateItem(
            { instanceId },
            {
                UpdateExpression: `SET #status = :status, lastModifiedTime = :timestamp, terminatedAt = :timestamp`,
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":status": "terminated",
                    ":timestamp": new Date().toISOString(),
                },
            },
        );
        dynamoDbUpdateStatus = "updated";
    } catch (error: unknown) {
        console.warn("Failed to update RunningInstances table (may not exist):", error);
        dynamoDbUpdateStatus = "not_found";
    }

    return {
        success: true,
        instanceId,
        dcvStopped: dcvResult.stoppedSuccessfully,
        detachVolumeState: detachResult.state,
        terminateInstanceState: terminateResult.state,
        dynamoDbUpdateStatus,
        message: `Instance ${instanceId} terminated successfully.`,
    };
}

export const handler = async (event: TerminateEc2Event): Promise<TerminateEc2Result> => {
    try {
        const { userId, instanceId, instanceArn } = event;

        // Validate required fields
        if (!userId) {
            throw new Error("userId is required");
        }

        // Get instanceId from event directly, or extract from instanceArn as fallback
        let resolvedInstanceId: string | undefined = instanceId;
        if (!resolvedInstanceId && instanceArn) {
            const parts = instanceArn.split("/");
            resolvedInstanceId = parts[parts.length - 1];
        }

        if (!resolvedInstanceId) {
            throw new Error("instanceId or instanceArn is required");
        }

        console.log(`Terminating instance ${resolvedInstanceId} for user ${userId}`);

        const runningInstancesTable = new DynamoDBWrapper(
            process.env.RUNNING_INSTANCES_TABLE_NAME || "RunningInstances",
        );
        const existingRecord = (await runningInstancesTable.getItem({
            instanceId: resolvedInstanceId,
        })) as RunningInstanceRecord | null;

        // Skip validation - the CheckRunningStreams step already verified the instance exists
        // and belongs to the user via the RunningStreams table

        const result = await terminateWorkflow(resolvedInstanceId, userId, runningInstancesTable);
        if (result.success) {
            await publishActiveInstancesDelta(-1);

            const sessionEndedAt = new Date();
            const creationTime = existingRecord?.creationTime;
            const instanceType = existingRecord?.instanceType;
            if (creationTime) {
                const durationMinutes = getSessionDurationMinutes(creationTime, sessionEndedAt);
                if (durationMinutes !== undefined) {
                    await publishAverageSessionDuration(durationMinutes);

                    if (instanceType) {
                        const estimatedCostUsd = estimateSessionCostUsd(instanceType, durationMinutes);
                        if (estimatedCostUsd !== undefined) {
                            await publishTotalCostEstimate(estimatedCostUsd);
                        }
                    }
                }
            }
        }
        return result;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Terminate error:", errorMessage);
        // Throw the error so Step Functions can catch it as a failure
        throw new Error(errorMessage || "Unknown error during instance termination");
    }
};
