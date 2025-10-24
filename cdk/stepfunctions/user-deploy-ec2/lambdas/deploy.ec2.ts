export const handler = async (
  event: DeployEc2Event
): Promise<DeployEc2Result> => {
  const userId = event.userId; // TODO: use userId for deploying EC2 instance

  try {
    console.log("Stub - Deploying EC2 instance for user");
    return { success: true };
  } catch (e) {
    return { success: false, error: "Error deploying EC2 instance" };
  }
};

// TODO: update this type when event structure received from stepfunctions is finalized
type DeployEc2Event = {
  userId: string;
};

type DeployEc2Result = {
  success: boolean;
  error?: string;
};
