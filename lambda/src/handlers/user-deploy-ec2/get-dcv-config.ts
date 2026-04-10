import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import EC2Wrapper from "../../utils/ec2Wrapper";

type GetDcvConfigEvent = {
    instanceArn: string;
    instanceId?: string;
};

type GetDcvConfigResult = {
    dcvPassword: string;
    dcvUser: string;
    dcvPort: number;
    dcvIp: string;
};

function resolveInstanceId(event: GetDcvConfigEvent): string {
    if (event.instanceId) {
        return event.instanceId;
    }

    if (!event.instanceArn) {
        throw new Error("MissingInstanceReference");
    }

    const parts = event.instanceArn.split("/");
    const resolvedInstanceId = parts[parts.length - 1];
    if (!resolvedInstanceId) {
        throw new Error("MissingInstanceReference");
    }

    return resolvedInstanceId;
}

export const handler = async (event: GetDcvConfigEvent): Promise<GetDcvConfigResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
    const stream = await db.getItem({ instanceArn: event.instanceArn });

    if (!stream) {
        throw new Error("StreamNotFound");
    }

    const instanceId = resolveInstanceId(event);
    const ec2Wrapper = new EC2Wrapper(
        process.env.LAMBDA_REGION || process.env.AWS_REGION || "us-west-2",
    );
    const instanceDetails = await ec2Wrapper.getInstanceDetails(instanceId);
    const currentDcvIp = instanceDetails.publicIp || stream.dcvIp || "";

    return {
        dcvPassword: stream.dcvPassword,
        dcvUser: stream.dcvUser || "Administrator",
        dcvPort: Number(stream.dcvPort || 8443),
        dcvIp: currentDcvIp,
    };
};
