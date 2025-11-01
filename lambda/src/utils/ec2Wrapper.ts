import {
    EC2Client,
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning,
    type RunInstancesCommandInput,
    type _InstanceType,
} from "@aws-sdk/client-ec2";
import { run } from "node:test";

/**
 * ============================================================================
 * LEARNING RESOURCES - READ THESE FIRST!
 * ============================================================================
 *
 * AWS SDK v3 EC2 Documentation:
 * - RunInstancesCommand: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/command/RunInstancesCommand/
 * - DescribeInstancesCommand: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/command/DescribeInstancesCommand/
 * - waitUntilInstanceRunning: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-ec2/Variable/waitUntilInstanceRunning/
 * NICE DCV (Remote Desktop Streaming):
 * - Uses port 8443 for HTTPS streaming
 * - Documentation: https://docs.aws.amazon.com/dcv/
 *
 * AMI (Amazon Machine Image):
 * - Ubuntu Server 22.04 LTS: Good base for gaming
 * - Find AMI IDs: https://cloud-images.ubuntu.com/locator/ec2/
 * - AMI IDs are region-specific!
 */

export interface EC2InstanceConfig {
    userId: string;

    instanceType?: _InstanceType; // e.g., "t3.medium", "g4dn.xlarge"
    amiId?: string;

    keyName?: string;
    securityGroupIds?: string[]; // Security groups (MUST allow port 8443 for DCV!)
    subnetId?: string;

    tags?: Record<string, string>; // Additional custom tags
}

export interface EC2InstanceResult {
    instanceId: string;
    publicIp?: string;
    privateIp?: string;
    state: string;
    createdAt: string;
    instanceArn: string;
}

const DEFAULT_INSTANCE_TYPE = "t3.medium";

class EC2Wrapper {
    private client: EC2Client;
    private region: string;

    constructor(region?: string) {
        this.region = region || process.env.CDK_DEFAULT_REGION || "us-east-1";
        this.client = new EC2Client({ region: this.region })
    }

    async createInstance(config: EC2InstanceConfig): Promise<EC2InstanceResult> {
        const {
            userId,
            instanceType = DEFAULT_INSTANCE_TYPE,
            amiId,
            keyName,
            securityGroupIds,
            subnetId,
            tags = {},
        } = config;

        const createdAt = new Date().toISOString();

        if (!amiId) {
            throw new Error("AMI ID is required");
        }

        const tagSpecifications: RunInstancesCommandInput["TagSpecifications"] = [
            {
                ResourceType: "instance",
                Tags: [
                    {
                        Key: "userId",
                        Value: userId
                    },
                    {
                        Key: "managed-by",
                        Value: "lunaris"
                    },
                    {
                        Key: "createdAt",
                        Value: createdAt
                    },
                    {
                        Key: "purpose",
                        Value: "cloud-gaming"
                    },
                ],
            },
        ];
        const customTagsArray = Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }));
        tagSpecifications[0].Tags = [...(tagSpecifications[0].Tags || []), ...customTagsArray];

        const input: RunInstancesCommandInput = {
            ImageId: amiId,
            InstanceType: instanceType,
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: tagSpecifications,

        };

        if (keyName) input.KeyName = keyName;
        if (securityGroupIds && securityGroupIds.length > 0) input.SecurityGroupIds = securityGroupIds;
        if (subnetId) input.SubnetId = subnetId;

        const command = new RunInstancesCommand(input)
        try {
            const response = await this.client.send(command);

            if (!response.Instances || response.Instances.length === 0) {
                throw new Error("No instances created");
            }

            const instance = response.Instances[0];
            const instanceId = instance.InstanceId;

            if (!instanceId) throw new Error("Instance ID not found in response");

            const accountId = process.env.CDK_DEFAULT_ACCOUNT || "unknown";
            const instanceArn = `arn:aws:ec2:${this.region}:${accountId}:instance/${instanceId}`;

            return {
                instanceId,
                publicIp: instance.PublicIpAddress,
                privateIp: instance.PrivateIpAddress,
                state: instance.State?.Name || "unknown",
                createdAt,
                instanceArn,
            }


        } catch (error: any) {
            switch (error.name) {
                case "InstanceLimitExceeded":
                    throw new Error("Cannot create instance: Account instance limit exceeded");
                case "InvalidAMIID.NotFound":
                    throw new Error(`AMI ID ${input.ImageId} not found in region ${this.region}`);
                case "InvalidSubnetID.NotFound":
                    throw new Error(`Subnet ID ${input.SubnetId} not found`);
                case "InvalidGroup.NotFound":
                    throw new Error("One or more security groups not found");
                case "InvalidKeyPair.NotFound":
                    throw new Error(`Key pair '${input.KeyName}' not found`);
                default:
                    throw new Error(`Failed to create EC2 instance: ${error.message}`);
            }
        }
    }
}

export default EC2Wrapper;
