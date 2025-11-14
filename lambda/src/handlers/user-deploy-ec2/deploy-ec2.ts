import { _InstanceType } from "@aws-sdk/client-ec2";
import EC2Wrapper, { type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import IAMWrapper from "../../utils/iamWrapper";
import DCVWrapper from "../../utils/dcvWrapper";
import SSMWrapper from "../../utils/ssmWrapper";
import { SSM } from "@aws-sdk/client-ssm";

type DeployEc2Event = {
    userId: string;
    instanceType?: _InstanceType;
};

type DeployEc2Result = {
    success: boolean;

    instanceId?: string;
    publicIp?: string;
    privateIp?: string;
    instanceArn?: string;

    state?: string;
    createdAt?: string;
    streamingUrl?: string;

    error?: string;
};

const AMI_ID_KEY = 'ami_id'

export const handler = async (
    event: DeployEc2Event
): Promise<DeployEc2Result> => {
    try {
        const { userId, instanceType } = event;

        // check param store for AMI ID
        // if found, pass it in to ec2Instance config
        const ssmWrapper = new SSMWrapper()
        const amiId = await ssmWrapper.getParamFromParamStore(AMI_ID_KEY)

        const iamWrapper = new IAMWrapper();
        const iamProfileArn = await iamWrapper.getProfile();

        // Small delay to allow IAM profile to propagate
        await new Promise(resolve => setTimeout(resolve, 2000));

        const ec2Wrapper = new EC2Wrapper();

        const instanceConfig: EC2InstanceConfig = {
            userId: userId,
            instanceType: instanceType,
            securityGroupIds: process.env.SECURITY_GROUP_ID ? [process.env.SECURITY_GROUP_ID] : undefined,
            iamInstanceProfile: iamProfileArn,
            amiId: amiId,
            subnetId: process.env.SUBNET_ID,
            keyName: process.env.KEY_PAIR_NAME,
        };

        console.log(`Creating EC2 instance for user ${userId}...`);

        const instanceResult = await ec2Wrapper.createAndWaitForInstance(instanceConfig);

        console.log(`Instance ${instanceResult.instanceId} is ready!`);

        // dcv wrapper is written so if the dcv is already configured, it will skip over creation
        const dcvWrapper = new DCVWrapper(instanceResult.instanceId, userId);
        const url = await dcvWrapper.getDCVSession()

        // if AMI ID not found, create snapshot and save the AMI ID
        // in the future i think this should be moved to terminate instance
        if (!amiId) {
             const newAmiId = await ec2Wrapper.snapshotAMIImage(instanceResult.instanceId, userId)
             await ssmWrapper.putParamInParamStore(AMI_ID_KEY, newAmiId)
        }

        return { success: true, streamingUrl: url, ...instanceResult }



    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Unknown error during instance creation",
        }
    }
};
