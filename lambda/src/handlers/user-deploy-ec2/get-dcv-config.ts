import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

type GetDcvConfigEvent = {
    instanceArn: string;
};

type GetDcvConfigResult = {
    dcvPassword: string;
    dcvUser: string;
    dcvPort: string;
    dcvIp: string;
};

export const handler = async (event: GetDcvConfigEvent): Promise<GetDcvConfigResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
    const stream = await db.getItem({ instanceArn: event.instanceArn });

    if (!stream) {
        throw new Error("StreamNotFound");
    }

    return {
        dcvPassword: stream.dcvPassword,
        dcvUser: stream.dcvUser || "Administrator",
        dcvPort: stream.dcvPort || "8443",
        dcvIp: stream.dcvIp || "",
    };
};
