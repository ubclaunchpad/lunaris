import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

type checkRunningInstancesEvent = {
    instanceId: string;
};

type checkRunningInstancesResult = {
    valid: boolean;
};

export const handler = async (
    event: checkRunningInstancesEvent,
): Promise<checkRunningInstancesResult> => {
    try {
        if (!process.env.RUNNING_INSTANCES_TABLE_NAME) {
            throw new Error("MissingTableNameEnv");
        }

        const db = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE_NAME);
        const instanceId = event.instanceId;
        const instance = await db.getItem({ instanceId });

        if (!instance) {
            return { valid: false };
        }

        if (!instance.status) {
            return { valid: false };
        }
        const valid = instance.status && instance.status === "running";

        return { valid };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log("Error occurred during check running instances:", message);
        throw error;
    }
};
