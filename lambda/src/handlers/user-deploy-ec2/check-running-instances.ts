import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

type checkRunningInstancesEvent = {
    userId: string;
};

type checkRunningInstancesResult = {
    status: string;
    instanceId: string;
};

export const handler = async (
    event: checkRunningInstancesEvent,
): Promise<checkRunningInstancesResult> => {
    if (!process.env.RUNNING_INSTANCES_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE_NAME);
    const userId = event.userId;
    const items = await db.queryByUserId(userId);
    // Filter out placeholder "deploying" records written by the API handler for
    // progress tracking — they are not real instances and should not block a new deploy.
    const realItems = (items ?? []).filter((item) => item.status !== "deploying");
    // Check if any items were returned
    if (realItems.length === 0) {
        return { status: "terminated", instanceId: "" };
    }

    // Get the first (most recent) instance
    const instance = realItems[0];
    const status = instance.status || "terminated";
    const instanceId = instance.instanceId || "";

    return { status, instanceId };
};
