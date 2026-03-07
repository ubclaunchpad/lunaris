import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
    event: UpdateRunningStreamsEvent,
): Promise<UpdateRunningStreamsResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);

    // instead of delete, update the status to stopped and updatedAt time to now
    const now = new Date().toISOString()

    const payload = {
        updatedAt: now,
        status: "stopped"
    };

    const expressionAttributeValues: Record<string, string | number> = {
        ":updatedAt": payload.updatedAt,
        ":status": payload.status
    };

    const updateExpression = `
      SET
        updatedAt = :updatedAt,
        #status = :status
    `;

    const updateConfig = {
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
            "#status": "status",
        },
        ExpressionAttributeValues: expressionAttributeValues,
    };

    await db.updateItem({ instanceArn: event.instanceArn }, updateConfig);

    return { success: true };
};

type UpdateRunningStreamsEvent = {
    userId: string;
    instanceArn: string;
};

type UpdateRunningStreamsResult = {
    success: boolean;
};
