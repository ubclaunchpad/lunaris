import EC2Wrapper from "../../utils/ec2Wrapper";
import { generateArn } from "../../utils/generateArn";

type ResumeDeployInstanceEvent = {
    instanceId: string;
};

type ResumeDeployInstanceResult = {
    instanceId: string;
    instanceArn: string;
};

export const handler = async (
    event: ResumeDeployInstanceEvent,
): Promise<ResumeDeployInstanceResult> => {
    const ec2Wrapper = new EC2Wrapper(process.env.LAMBDA_REGION || "us-west-2");

    const instanceId = event.instanceId;
    if (!instanceId) {
        throw new Error("instanceId not found in ResumeDeployInstanceHandler");
    }

    await ec2Wrapper.resumeAndStartInstance(instanceId);

    return {
        instanceId,
        instanceArn: generateArn(process.env.LAMBDA_REGION || "us-west-2", instanceId),
    };
};
