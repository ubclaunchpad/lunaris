import {
    AttachVolumeCommandInput,
    EC2Client,
    CreateVolumeCommand,
    AttachVolumeCommand,
    DescribeVolumesCommand,
    ModifyInstanceAttributeCommand,
    type CreateVolumeRequest,
    type CreateVolumeCommandOutput,
    type AttachVolumeCommandOutput,
    type ModifyInstanceAttributeCommandInput} from "@aws-sdk/client-ec2";

export interface CreateVolumeCommandConfig {
    userId: string;
    availabilityZone?: string;
    size?: number;
    volumeType?: string;
    tags?: Record<string, string>;

}

export interface EBSVolumeResult {
    volumeId: string,
    status: EBSStatusEnum
}

enum EBSStatusEnum {
    AVAILABLE = 'available',
    IN_USE = 'in-use'
}

// NOTE: AWS configures EBS size based on GiB, not GB. So just leaving this here in case we need to convert
const GBtoGIBConversion: number = 1.074

class EBSWrapper {
    private client: EC2Client
    private region: string
    private size: number = 100 // default
    private type: string = 'gp3' // default

    // leaving optional call to size here for future config
    constructor( region?: string, size?: number) {
        this.client = new EC2Client({ region});
        this.region = region || process.env.CDK_DEFAULT_REGION || "us-east-1";
        this.size = size ?? this.size
    }

    async createAndAttachEbsVolume(config: CreateVolumeCommandConfig, instanceId: string): Promise<EBSVolumeResult> {
        // first check RunningInstance table
        // if the user already has an instace? worry abt this later

        try {
            const volume = await this.createAndWaitForEbsVolume(config)
            if (!volume.volumeId) {
                throw new Error("Volume creation failed - no VolumeId returned")
            }
            const response = await this.attachAndWaitForEbsVolume(instanceId, volume.volumeId)

            return response
        } catch (err: any) {
            throw new Error(err.message)
        }
    }

     async createAndWaitForEbsVolume(config: CreateVolumeCommandConfig): Promise<EBSVolumeResult> {
        try {
            const volume = await this.createEBSVolume(config)
            const status = await this.waitForEbsVolume(volume.volumeId, 300, EBSStatusEnum.AVAILABLE)
            return {
                volumeId: volume.VolumeId, status}

        } catch (err: any) {
            console.error("failed to create EbsVolume")
            throw err
        }
    }

     async attachAndWaitForEbsVolume(instanceId: string, volumeId: string): Promise<EBSVolumeResult> {
        try {
            const response = await this.attachEbsVolume(instanceId, volumeId)
            const status = await this.waitForEbsVolume(volumeId,300, EBSStatusEnum.IN_USE)
            return {
                volumeId: response.VolumeId, status}
        } catch (err: any) {
            console.error("failed to attach EbsVolume to EC2instance")
            throw err
        }

    }

     async createEBSVolume(config: CreateVolumeCommandConfig): Promise<CreateVolumeCommandOutput> {
        try {
            const {
                userId,
                availabilityZone =this.region,
                size = this.size,
                volumeType = this.type,
                tags = {}
            } = config

            const tagSpecs: CreateVolumeRequest["TagSpecifications"] = [
                {
                    ResourceType: "volume",
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
                        ...Object.entries(tags).map(([key, value]) => ({key, value}))
                    ]
                }
            ]

            const input: CreateVolumeRequest = {
                AvailabilityZone: availabilityZone,
                Size: size,
                VolumeType: volumeType,
                TagSpecifications: tagSpecs
            }

            const createVolumeCommand = new CreateVolumeCommand(input)
            const createVolumeResponse = await this.client.send(createVolumeCommand)
            return createVolumeResponse
        } catch (err: any) {
            switch (err.name) {
                case "InsufficientVolumeCapacity":
                    throw new Error("Cannot create volume: There is not enough capacity to fulfill the EBS volume provision request")
                default:
                    throw new Error("Cannot create volume: Failed to create EBS volume")
            }
        }
    }

    async attachEbsVolume(instanceId: string, volumeId: string): Promise<AttachVolumeCommandOutput> {
        try {
            const attachEBSInput: AttachVolumeCommandInput = {
                InstanceId: instanceId,
                VolumeId: volumeId,
                Device: "/dev/sdf",
            }
            const attachEBSCommand = await AttachVolumeCommand(attachEBSInput)
            const response = await this.client.send(attachEBSCommand)

            // set DeleteOnTermination to false
            const modifyEBSInput: ModifyInstanceAttributeCommandInput = {
                InstanceId: instanceId,
                BlockDeviceMappings: [
                    {
                    DeviceName: "dev/sdf",
                    Ebs: {
                        VolumeId: volumeId,
                        DeleteOnTermination: false

                        }
                    }
                ]
            }
            const modifyEBSCommand = await ModifyInstanceAttributeCommand(modifyEBSInput)
            await this.client.send(modifyEBSCommand);
            return response
        } catch (err: any) {
            console.error(`Failed to attach ${volumeId}`)
            throw err
        }
    }

    async waitForEbsVolume(volumeId: string,
        maxWaitTimeSeconds: number = 300,
        status: EBSStatusEnum
    ): Promise<EBSStatusEnum> {
        const startTime = Date.now()
        const pollInterval  = 5000
        const maxWaitTime = maxWaitTimeSeconds * 1000

        while (Date.now() - startTime < maxWaitTime) {
            const command = new DescribeVolumesCommand({VolumeIds: [volumeId]})
            const response = await EC2Client.send(command)

            // check if the command status matches what we need
            const volumeState = response.Volumes?.[0]?.State
            if (volumeState == status) {
                console.log(`Volume ${volumeId} is now ${status}`)
                return volumeState
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval))
        }

        throw new Error(`Timeout: Volume ${volumeId} did not become ${status} within the wait Time`)

    }
}

export default EBSWrapper;
