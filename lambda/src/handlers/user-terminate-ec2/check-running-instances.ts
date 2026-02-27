import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

type checkRunningInstancesEvent = {
    instanceId: string;
};

type checkRunningInstancesResult = {
    valid: boolean;
};

// QUESTION: should this be wrapped in try catch?
export const handler = async (
    event: checkRunningInstancesEvent,
): Promise<checkRunningInstancesResult> => {
    try {
        if (!process.env.RUNNING_INSTANCES_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE_NAME);
    const instanceId = event.instanceId;
    const items = await db.query({
        IndexName: "InstanceIdIndex",
        KeyConditionExpression: "instanceId = :instanceId",
        ExpressionAttributeValues: {
            ":instanceId": instanceId,
        },
        ScanIndexForward: false, // Get most recent first
    });

    // Check if any items were returned
    if (!items || items.length === 0) {
        return { valid: false };
    }

    // Get the first (most recent) instance
    const instance = items[0];
    if (!instance.status) {
        return { valid: false };
    }
    const valid = instance.status && instance.status === "running";

    return { valid };

    } catch (error) {
        const message = error instanceof(Error)? error.message: String(error)
        console.log("Error occurred during check running instances:", message)
        throw error
    }

};
