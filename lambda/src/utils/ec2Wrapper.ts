import {
    EC2Client,
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning,
    type RunInstancesCommandInput,
    type _InstanceType,
} from "@aws-sdk/client-ec2";
import { generateArn } from "./generateArn";

export interface EC2InstanceConfig {
    userId: string;

    instanceType?: _InstanceType; // e.g., "t3.medium", "g4dn.xlarge"

    keyName?: string;
    securityGroupIds?: string[];
    subnetId?: string;

    tags?: Record<string, string>;
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

    private prepareInstanceInput(config: EC2InstanceConfig): RunInstancesCommandInput {
        const {
            userId,
            instanceType = DEFAULT_INSTANCE_TYPE,
            keyName,
            securityGroupIds,
            subnetId,
            tags = {},
        } = config;

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
                        Value: new Date().toISOString()
                    },
                    {
                        Key: "purpose",
                        Value: "cloud-gaming"
                    },
                    ...Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
                ],
            },
        ];
        const input: RunInstancesCommandInput = {
            // use launch template w/ preinstalled DCV
            LaunchTemplate: {
                LaunchTemplateName: "BasicDCV",
            },
            InstanceType: instanceType, // optional override
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: tagSpecifications,
        };

        if (keyName) input.KeyName = keyName;
        if (securityGroupIds && securityGroupIds.length > 0) input.SecurityGroupIds = securityGroupIds;
        if (subnetId) input.SubnetId = subnetId;

        return input;
    }

    async createInstance(config: EC2InstanceConfig): Promise<EC2InstanceResult> {
        if (!config.userId || config.userId.trim() === '') {
            throw new Error('userId is required and cannot be empty');
        }

        const input = this.prepareInstanceInput(config);
        const command = new RunInstancesCommand(input);

        try {
            const response = await this.client.send(command);

            const instance = response.Instances?.[0];
            if (!instance || !instance.InstanceId) throw new Error("No instances created");

            const instanceId = instance.InstanceId;

            if (!instanceId) throw new Error("Instance ID not found in response");

            return {
                instanceId: instanceId,
                publicIp: instance.PublicIpAddress,
                privateIp: instance.PrivateIpAddress,
                state: instance.State?.Name || "unknown",
                createdAt: new Date().toISOString(),
                instanceArn: generateArn(this.region, instanceId),
            }

        } catch (error: any) {
            switch (error.name) {
                case "InstanceLimitExceeded":
                    throw new Error("Cannot create instance: Account instance limit exceeded");
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

    async waitForInstanceRunning(
        instanceId: string,
        maxWaitTimeSeconds: number = 300
    ): Promise<EC2InstanceResult> {

        try {
            // poll until instance is running
            await waitUntilInstanceRunning(
                {
                    client: this.client,
                    maxWaitTime: maxWaitTimeSeconds,
                },
                {
                    InstanceIds: [instanceId]
                }
            )

            const command = new DescribeInstancesCommand({
                InstanceIds: [instanceId]
            });
            const response = await this.client.send(command);

            const instance = response.Reservations?.[0]?.Instances?.[0];

            if (!instance) throw new Error(`Instance ${instanceId} not found`);

            const id = instance.InstanceId || instanceId;

            const createdAt = instance.LaunchTime?.toDateString() || new Date().toISOString();

            return {
                instanceId: id,
                publicIp: instance.PublicIpAddress,
                privateIp: instance.PrivateIpAddress,
                state: instance.State?.Name || "running",
                createdAt: createdAt,
                instanceArn: generateArn(this.region, instanceId)
            }

        } catch (error: any) {
            switch (error.name) {
                case "WaiterTimedOut":
                    throw new Error(`Timeout waiting for instance ${instanceId} to reach running state`);
                default:
                    throw new Error(`Error waiting for instance ${instanceId}`);
            }
        }
    }

    async createAndWaitForInstance(
        config: EC2InstanceConfig,
        waitForRunning: boolean = true
    ): Promise<EC2InstanceResult> {
        try {
            const instanceResult = await this.createInstance(config);
            if (waitForRunning) {
                return await this.waitForInstanceRunning(instanceResult.instanceId);
            }
            return instanceResult;

        } catch (error: any) {
            const errorMessage = error.message || String(error);
            throw new Error(`Failed to create and wait for instance: ${errorMessage}`, { cause: error });
        }
    }
}

export default EC2Wrapper;
