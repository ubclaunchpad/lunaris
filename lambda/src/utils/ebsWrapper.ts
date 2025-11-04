import {
    EC2Client,
    CreateVolumeCommand,
    AttachVolumeCommand,
    DescribeVolumesCommand,
    type CreateVolumeRequest,
    type CreateVolumeCommandOutput
} from "@aws-sdk/client-ec2";
import { Key } from "aws-cdk-lib/aws-kms";

export interface CreateVolumeCommandConfig {
    userId: string;
    availabilityZone?: string;
    size?: number;
    volumeType?: string;
    tags?: Record<string, string>;
    // tags: userId, managed-by, etc. matching ec2 instance
    // instanceARN?
    //throughput?

}

interface AttachVolumeCommandConfig {

}

enum waitForEbsVolumeEnum {
    AVAILABLE = 'available',
    IN_USE = 'in-use'

}
//
const GBtoGIBConversion: number = 1.074

class EBSWrapper {
    private client: EC2Client
    private region: string
    private size: number = 100 // DEFAULT is 100 GiB
    private type: string = 'gp3' // DEFAULT


    constructor( region?: string, size?: number) {
        this.client = new EC2Client({ region});
        this.region = region || process.env.CDK_DEFAULT_REGION || "us-east-1";
        this.size = size ?? this.size
    }


    async attachEbsVolume(instanceId: string) {
        try {

        } catch (err) {
            // catch attachment timeout
        }

    }

    async attachandWaitForEbsVolume() {

    }

    async waitForEbsVolume(volumeId: string,
        maxWaitTimeSeconds: number = 300,
        status: waitForEbsVolumeEnum
    ): Promise<void> {
        const startTime = Date.now()
        const pollInterval  = 5000
        const maxWaitTime = maxWaitTimeSeconds * 1000

        while (Date.now() - startTime < maxWaitTime) {
            const command = new DescribeVolumesCommand({VolumeIds: [volumeId]})
            const response = await EC2Client.send(command)

            // check if the command status matches what we need
            const volumeState = response.Volumes?.[0]?.State
            if (volumeState == status) {
                console.log(`Volume ${volumeId} is now in Use`)
                return
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval))
        }

    }

    async createEBSVolume(config: CreateVolumeCommandConfig): Promise<CreateVolumeCommandOutput> {
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

    }

    async createAndWaitForEbsVolume(config: CreateVolumeCommandConfig,
        wait: boolean = true
    ) {
        try {
            const volume = await this.createEBSVolume(config)
            if (wait) {
                await this.waitForEbsVolume(volume.volumeId, 300, waitForEbsVolumeEnum.AVAILABLE)
            }
            return volume

        } catch (err) {
            console.log("error occured")
            throw new Error()
        }


    }

    async createAndAttachEbsVolume(config: CreateVolumeCommandConfig, instanceId: string) {
        // first check RunningInstance table
        // if the user already has an instace? worry abt this later
        try {
        // wait till ebs volume is in use
        const volume = await this.createAndWaitForEbsVolume(config)


        // attach the ebs volume to the instanceId, wait till its attached
        await this.attachandWaitForEbsVolume(instanceId)
        } catch (err) {


        }
    }


}

export default EBSWrapper;
