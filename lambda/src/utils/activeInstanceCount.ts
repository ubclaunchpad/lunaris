import DynamoDBWrapper from "./dynamoDbWrapper";

/** Statuses that count toward “active” fleet size in RunningInstances (GSI StatusCreationTimeIndex). */
export const ACTIVE_INSTANCE_STATUSES = ["running", "pending"] as const;

/**
 * Current active instance count from DynamoDB (source of truth for gauge metrics).
 */
export async function countActiveInstances(runningInstancesTable: DynamoDBWrapper): Promise<number> {
    const counts = await Promise.all(
        ACTIVE_INSTANCE_STATUSES.map((status) => runningInstancesTable.queryByStatus(status)),
    );
    return counts.reduce((sum, items) => sum + items.length, 0);
}
