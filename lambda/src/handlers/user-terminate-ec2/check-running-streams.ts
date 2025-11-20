import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
    event: CheckRunningStreamsEvent,
): Promise<CheckRunningStreamsResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

  const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
  const { userId } = event;

  if (!userId) {
    throw new Error("User ID is required");
  }

  try {
    console.log(`Checking running streams for user: ${userId}`);

    // Query using UserIdIndex GSI
    const items = await db.query({
      IndexName: "UserIdIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    });

    if (!items || items.length === 0) {
      return {
        valid: false,
        message: "No active streaming session found for user",
      };
    }

    // Return the first active stream
    const stream = items[0];

    console.log(
      `Found active stream for user ${userId}: ${stream.instanceArn}`
    );

    return {
      valid: true,
      sessionId: stream.streamingId || userId,
      instanceArn: stream.instanceArn,
      instanceId: stream.instanceArn.split("/").pop() || "", // Extract instanceId from ARN
    };
  } catch (error) {
    console.error("Error checking running streams:", error);
    throw new Error(
      `DatabaseError: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

type CheckRunningStreamsEvent = {
    userId: string;
};

type CheckRunningStreamsResult = {
  valid: boolean;
  message?: string;
  sessionId?: string;
  instanceArn?: string;
  instanceId?: string;
};
