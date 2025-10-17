import DynamoDBWrapper from "../../../lib/utils/dynamoDbWrapper";

export const handler = async (
  event: UpdateRunningStreamsEvent
): Promise<boolean> => {
  if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
    console.error("RUNNING_STREAMS_TABLE_NAME environment variable is not set");
    return false;
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
    if (e instanceof Error) {
      console.error(
        "Error adding/updating item in RunningStreams Table: ",
        e.message
      );
    }
    return false;
  }

  return true;
};

type UpdateRunningStreamsEvent = {
  userId: string;
  sessionId: string;
  instanceArn: string;
  running: boolean;
};
