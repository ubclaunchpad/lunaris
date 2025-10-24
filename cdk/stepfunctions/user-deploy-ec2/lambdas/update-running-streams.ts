import DynamoDBWrapper from "../../../lib/utils/dynamoDbWrapper";

export const handler = async (
  event: UpdateRunningStreamsEvent
): Promise<UpdateRunningStreamsResult> => {
  if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
    return {
      success: false,
      error: "RUNNING_STREAMS_TABLE_NAME environment variable is not set",
    };
  }

  const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
  const payload = { ...event };

  try {
    // TODO: the RunningStreams table stores items in the format of:
    // - userId (string)
    // - instanceArn (string)
    // - streamingId (string)
    // - streamingLink (string)
    // so figure out how the event maps to these fields
    await db.putItem(payload);
  } catch (e) {
    return {
      success: false,
      error: "Error adding/updating item in RunningStreams Table",
    };
  }

  return { success: true };
};

type UpdateRunningStreamsEvent = {
  userId: string;
  sessionId: string;
  instanceArn: string;
  running: boolean;
};

type UpdateRunningStreamsResult = {
  success: boolean;
  error?: string;
};
