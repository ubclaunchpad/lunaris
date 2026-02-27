import EC2Wrapper from "../../utils/ec2Wrapper";
import { StopResult } from "../../utils/ec2Wrapper";

type stopEC2Event = {
    userId: string;
    instanceId: string;
};

type stopEc2Result = StopResult;

0;
export const handler = async (event: stopEC2Event): Promise<stopEc2Result> => {
    try {
        if (!process.env.LAMBDA_REGION) {
            throw new Error("MissingLambdaRegionEnv");
        }
        const ec2Wrapper = new EC2Wrapper(process.env.LAMBDA_REGION);

        const result = await ec2Wrapper.stopEC2Instance(event.instanceId);

        if (result.status !== "stopped") {
            throw new Error("InvalidStatus");
        }

        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log("Failed to stop ec2 instance:", message);
        throw error;
    }
};
