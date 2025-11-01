export const handler = async (
  event: TerminateEc2Event
): Promise<TerminateEc2Result> => {
  const userId = event.userId; // TODO: use userId for terminating EC2 instance

  console.log("Stub - Terminating EC2 instance for user");
  return { success: true };
};

type TerminateEc2Event = {
  userId: string;
};

type TerminateEc2Result = {
  success: boolean;
};
