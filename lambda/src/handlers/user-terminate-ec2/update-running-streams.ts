import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
  event: UpdateRunningStreamsEvent
): Promise<UpdateRunningStreamsResult> => {
  if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
    throw new Error("MissingTableNameEnv");
  }

  const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
  const { instanceArn } = event;

  if (!instanceArn) {
    throw new Error("Instance ARN is required");
  }

  try {
    console.log(`Deleting stream record for instance: ${instanceArn}`);

    // DELETE the stream record (session is over)
    await db.deleteItem({ instanceArn });

    console.log(`Successfully deleted stream record for ${instanceArn}`);
    return { success: true };
  } catch (error) {
    console.error("Error deleting stream record:", error);
    throw new Error(
      `DatabaseError: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

type UpdateRunningStreamsEvent = {
  userId: string;
  sessionId: string;
  instanceArn: string;
  running: boolean;
};

type UpdateRunningStreamsResult = {
  success: boolean;
};
