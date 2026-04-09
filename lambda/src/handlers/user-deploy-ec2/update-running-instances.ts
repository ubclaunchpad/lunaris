import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { DEFAULT_INSTANCE_TYPE } from "../../utils/ec2Wrapper";
import { countActiveInstances } from "../../utils/activeInstanceCount";
import { publishActiveInstancesRealtimeCount } from "../../utils/cloudWatchMetrics";

type UpdateRunningInstancesEvent = {
    instanceId: string;
    instanceArn: string;
    ebsVolumeId?: string;
    userId: string;
    gameId?: string;
    creationTime: string;
};

type UpdateRunningInstancesResult = {
    success: boolean;
    instanceId: string;
};

export const handler = async (
    event: UpdateRunningInstancesEvent,
): Promise<UpdateRunningInstancesResult> => {
    try {
        if (!process.env.RUNNING_INSTANCES_TABLE_NAME) {
            throw new Error("MissingTableNameEnv");
        }

        if (!event.instanceArn || !event.instanceId) {
            throw new Error("Missing required fields: instanceArn, instanceId");
        }

        console.log("Update event received:", JSON.stringify(event));

        const db = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE_NAME);
        const now = new Date().toISOString();

        const payload = {
            instanceId: event.instanceId,
            instanceArn: event.instanceArn,
            ebsVolumeId: event.ebsVolumeId,
            userId: event.userId,
            gameId: event.gameId,
            creationTime: event.creationTime,
            status: "running",
            lastModifiedTime: now,
            region: process.env.LAMBDA_REGION,
            instanceType: DEFAULT_INSTANCE_TYPE,
        };

        const expressionAttributeValues: Record<string, string> = {
            ":instanceArn": payload.instanceArn,
            ":userId": payload.userId,
            ":creationTime": payload.creationTime,
            ":status": payload.status,
            ":lastModifiedTime": payload.lastModifiedTime,
            ":region": payload.region || "us-west-2",
            ":instanceType": payload.instanceType,
        };

        const setExpressions = [
            "instanceArn = :instanceArn",
            "userId = :userId",
            "creationTime = if_not_exists(creationTime, :creationTime)",
            "#status = :status",
            "lastModifiedTime = :lastModifiedTime",
            "#region = :region",
            "instanceType = :instanceType",
        ];

        if (payload.ebsVolumeId) {
            expressionAttributeValues[":ebsVolumeId"] = payload.ebsVolumeId;
            setExpressions.push("ebsVolumeId = :ebsVolumeId");
        }

        if (payload.gameId) {
            expressionAttributeValues[":gameId"] = payload.gameId;
            setExpressions.push("gameId = :gameId");
        }

        const updateExpression = `SET ${setExpressions.join(", ")}`;

        await db.updateItem(
            { instanceId: event.instanceId },
            {
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: {
                    "#status": "status",
                    "#region": "region",
                },
                ExpressionAttributeValues: expressionAttributeValues,
            },
        );

        const activeCount = await countActiveInstances(db);
        await publishActiveInstancesRealtimeCount(activeCount);

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
