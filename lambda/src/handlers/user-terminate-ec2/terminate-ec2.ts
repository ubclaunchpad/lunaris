import { EC2Client, TerminateInstancesCommand } from "@aws-sdk/client-ec2";

const ec2Client = new EC2Client({});

/**
 * This lambda function terminates an EC2 instance
 * @param event containing the instanceId, userId, and instanceArn
 * @returns
 */
export const handler = async (event: TerminateEc2Event): Promise<TerminateEc2Result> => {
    const { instanceId } = event;

    if (!instanceId) {
        throw new Error("Instance ID is required");
    }

    try {
        console.log(`Terminating EC2 instance: ${instanceId}`);

        const command = new TerminateInstancesCommand({
            InstanceIds: [instanceId],
        });

        const response = await ec2Client.send(command);

        if (!response.TerminatingInstances || response.TerminatingInstances.length === 0) {
            throw new Error("Failed to terminate EC2 instance");
        }

        const terminatingInstance = response.TerminatingInstances[0];

        console.log(`Successfully terminated instance ${instanceId}`);

        return {
            success: true,
            instanceId: instanceId,
            previousState: terminatingInstance.PreviousState?.Name || "unknown",
            currentState: terminatingInstance.CurrentState?.Name || "shutting-down",
        } as TerminateEc2Result;
    } catch (error) {
        console.error("Error terminating EC2 instance:", error);
        throw new Error(
            `TerminationFailedError: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};

type TerminateEc2Event = {
    userId?: string;
    instanceId: string;
    instanceArn: string;
};

type TerminateEc2Result = {
    success: boolean;
    instanceId: string;
    previousState: string;
    currentState: string;
};
