import { _InstanceType } from "@aws-sdk/client-ec2";
import EC2Wrapper, { type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import IAMWrapper from "../../utils/iamWrapper";
import DCVWrapper from "../../utils/dcvWrapper";

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

export const handler = async (
    event: DeployEc2Event
): Promise<DeployEc2Result> => {
    try {
        const { userId, instanceType } = event;

        // check param store for AMI ID
        // if found, pass it in to ec2Instance config



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
            subnetId: process.env.SUBNET_ID,
            keyName: process.env.KEY_PAIR_NAME,
        };

        console.log(`Creating EC2 instance for user ${userId}...`);

        const instanceResult = await ec2Wrapper.createAndWaitForInstance(instanceConfig);

        console.log(`Instance ${instanceResult.instanceId} is ready!`);
        // if AMI ID not found, use DCV wrapper here to install DCV
        // create snapshot and save the AMI ID
        const dcvWrapper = new DCVWrapper(instanceResult.instanceId, userId);
        const url = await dcvWrapper.getAndCreateDCVSession()

        const amiId = ec2Wrapper.snapshotAMIImage(instanceResult.instanceId, userId)

        return { success: true, ...instanceResult }



    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Unknown error during instance creation",
        }
    }
};
