import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
    event: CheckRunningStreamsEvent,
): Promise<CheckRunningStreamsResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
    const userId = event.userId;

    // Query by userId using the GSI (userId is not the primary key, instanceArn is)
    const items = await db.query({
        IndexName: "UserIdIndex",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
            ":userId": userId,
        },
        ScanIndexForward: false, // Get most recent first
    });

    const item = items.find((i) => i.status === "running");

    if (!item) {
        return {
            valid: false,
            message: "No active streaming session found for user",
        };
    }

    return {
        valid: true,
        sessionId: item.sessionId || userId,
        instanceId: item.instanceId,
        instanceArn: item.instanceArn,
    };
};

type CheckRunningStreamsEvent = {
    userId: string;
};

type CheckRunningStreamsResult = {
    valid: boolean;
    message?: string;
    sessionId?: string;
    instanceId?: string;
    instanceArn?: string;
};
