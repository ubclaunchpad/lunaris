import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { countActiveInstances } from "../../utils/activeInstanceCount";
import { publishActiveInstancesReconciledCount } from "../../utils/cloudWatchMetrics";

type HandlerResponse = {
    success: boolean;
    activeInstances?: number;
    error?: string;
};

export const handler = async (): Promise<HandlerResponse> => {
    const tableName = process.env.RUNNING_INSTANCES_TABLE_NAME;
    if (!tableName) {
        return {
            success: false,
            error: "RUNNING_INSTANCES_TABLE_NAME is not set",
        };
    }

    const dynamo = new DynamoDBWrapper(tableName);

    try {
        const activeInstances = await countActiveInstances(dynamo);
        await publishActiveInstancesReconciledCount(activeInstances);

        return {
            success: true,
            activeInstances,
        };
    } catch (error: unknown) {
        console.error("Failed to publish ActiveInstancesReconciled metric:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};
