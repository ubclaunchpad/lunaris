import DynamoDBWrapper from "../../../lib/utils/dynamoDbWrapper";

export const handler = async (
  event: CheckUserExistsEvent
): Promise<boolean> => {
  if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
    console.error("RUNNING_STREAMS_TABLE_NAME environment variable is not set");
    return false;
  }

  const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
  const userId = event.userId;

  try {
    const item = await db.getItem({ userId });
    if (item) {
      return true;
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error("Error fetching item in RunningStreams Table: ", e.message);
    }
    return false;
  }

  return false;
};

// TODO: update this type when event structure received from stepfunctions is finalized
type CheckUserExistsEvent = {
  userId: string;
};
