export const handler = async (event: DeployEc2Event): Promise<boolean> => {
  const userId = event.userId; // TODO: use userId for deploying EC2 instance

  try {
    console.log("Stub - Deploying EC2 instance for user");
    return true;
  } catch (e) {
    if (e instanceof Error) {
      console.error("Error deploying EC2 instance: ", e.message);
    }
    return false;
  }
};

// TODO: update this type when event structure received from stepfunctions is finalized
type DeployEc2Event = {
  userId: string;
};
