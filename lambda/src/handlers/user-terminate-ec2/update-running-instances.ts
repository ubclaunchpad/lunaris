import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

type updateRunningInstancesEvent = {
    instanceId: string;
    status: string;
};

type updateRunningInstancesResult = {
    success: boolean;
    instanceId: string;
};

export const handler = async (
    event: updateRunningInstancesEvent,
): Promise<updateRunningInstancesResult> => {
    try {
        if (!process.env.RUNNING_INSTANCES_TABLE_NAME) {
            throw new Error("MissingTableNameEnv");
        }

        if (!event.instanceId || !event.status) {
            throw new Error("Missing required fields: instanceId, status");
        }

        console.log("Update event received:", JSON.stringify(event));

        const db = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE_NAME);
        const now = new Date().toISOString();

        const payload = {
            instanceId: event.instanceId,
            status: event.status,
            lastModifiedTime: now,
        };

        const expressionAttributeValues: Record<string, string> = {
            ":status": payload.status,
            ":lastModifiedTime": payload.lastModifiedTime,
        };

        const updateExpression = `
            SET
                #status = :status,
                lastModifiedTime = :lastModifiedTime,
        `;

        const updateConfig = {
            Key: { instanceId: event.instanceId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: expressionAttributeValues,
        };

        await db.updateItem(updateConfig);

        return {
            success: true,
            instanceId: event.instanceId,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to update running instances:", message);
        throw error;
    }
};
