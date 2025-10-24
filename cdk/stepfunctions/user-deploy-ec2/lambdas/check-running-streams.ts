import DynamoDBWrapper from "../../../lib/utils/dynamoDbWrapper";

export const handler = async (
  event: CheckRunningStreamsEvent
): Promise<CheckRunningStreamsResult> => {
  if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
    return {
      valid: false,
      error: "RUNNING_STREAMS_TABLE_NAME environment variable is not set",
    };
  }

  const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
  const userId = event.userId;

  try {
    const item = await db.getItem({ userId });
    return item ? { valid: true } : { valid: false };
  } catch (e) {
    return {
      valid: false,
      error: "Error fetching item in RunningStreams Table",
    };
  }
};

// TODO: update this type when event structure received from stepfunctions is finalized
type CheckRunningStreamsEvent = {
  userId: string;
};

type CheckRunningStreamsResult = {
  valid: boolean;
  error?: string;
};
