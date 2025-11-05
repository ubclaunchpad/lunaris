import { _InstanceType } from "@aws-sdk/client-ec2";
import EC2Wrapper, { type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import EBSWrapper, {type CreateVolumeCommandConfig type EBSStatusEnum} from '../../utils/ebsWrapper';

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
    volumeId?: string;
    attachmentStatus?: EBSStatusEnum

    error?: string;
};

export const handler = async (
    event: DeployEc2Event
): Promise<DeployEc2Result> => {
    try {
        const { userId, instanceType } = event;

        const ec2Wrapper = new EC2Wrapper();

        const instanceConfig: EC2InstanceConfig = {
            userId: userId,
            instanceType: instanceType,
            securityGroupIds: process.env.SECURITY_GROUP_ID ? [process.env.SECURITY_GROUP_ID] : undefined,
            subnetId: process.env.SUBNET_ID,
            keyName: process.env.KEY_PAIR_NAME,
        };

        console.log(`Creating EC2 instance for user ${userId}...`);

        const instanceResult = await ec2Wrapper.createAndWaitForInstance(instanceConfig);

        console.log(`Instance ${instanceResult.instanceId} is ready!`);

        const ebsWrapper = new EBSWrapper();

        const ebsConfig: CreateVolumeCommandConfig =  {
            userId: userId
            // the rest of the fields are optional for later customizations to ebs volumes
        }

        const ebsResult = await ebsWrapper.createAndAttachEBSVolume(ebsConfig, instanceResult.instanceId)

        // Update instanceResult
        return { success: true, ...instanceResult, ...ebsResult}

    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Unknown error during instance creation",
        }
    }
};
