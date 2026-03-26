import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { LUNARIS_METRICS_NAMESPACE, LunarisMetricName } from "../../utils/cloudWatchMetrics";
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";

type HandlerResponse = {
    success: boolean;
    activeInstances?: number;
    error?: string;
};

const ACTIVE_STATUSES = ["running", "pending"] as const;

function getCloudWatchClient(): CloudWatchClient {
    const region = process.env.AWS_REGION ?? process.env.LAMBDA_REGION ?? "us-east-1";
    return new CloudWatchClient({ region });
}

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
        const counts = await Promise.all(ACTIVE_STATUSES.map((status) => dynamo.queryByStatus(status)));
        const activeInstances = counts.reduce((sum, items) => sum + items.length, 0);

        await getCloudWatchClient().send(
            new PutMetricDataCommand({
                Namespace: LUNARIS_METRICS_NAMESPACE,
                MetricData: [
                    {
                        MetricName: LunarisMetricName.ActiveInstances,
                        Value: activeInstances,
                        Unit: StandardUnit.Count,
                        Timestamp: new Date(),
                    },
                ],
            }),
        );

        return {
            success: true,
            activeInstances,
        };
    } catch (error: unknown) {
        console.error("Failed to publish ActiveInstances metric:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};
