import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { DEFAULT_INSTANCE_TYPE } from "../../utils/ec2Wrapper";

type UpdateRunningInstancesEvent = {
    instanceId: string;
    instanceArn: string;
    userId: string;
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
            userId: event.userId,
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

        const updateExpression = `
            SET
                instanceArn = :instanceArn,
                userId = :userId,
                creationTime = if_not_exists(creationTime, :creationTime),
                #status = :status,
                lastModifiedTime = :lastModifiedTime,
                #region = :region,
                instanceType = :instanceType
        `;

        const updateConfig = {
            Key: { instanceId: event.instanceId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: {
                "#status": "status",
                "#region": "region",
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
