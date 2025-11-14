import {SSMClient, SendCommandCommand, type SendCommandCommandInput }  from "@aws-sdk/client-ssm"
import EC2Wrapper from "./ec2Wrapper";

const ssmDocumentName = "Lunaris- DCV-SSM-Document"

class dcvWrapper {
    private ssmClient: SSMClient;
    private instanceId: string
    private ec2: EC2Wrapper

    constructor(instanceId: string) {
        this.ssmClient = new SSMClient();
        this.instanceId = instanceId;
        this.ec2 = new EC2Wrapper();

    }

    async getAndCreateDCVSession(): Promise<void> {
        // call install dcv


        // call start dcv session


    }

     // 1. Install DCV on a running instance
    async installDCV(): Promise<void> {
        try {
            // check for if instance already has DCVconfigured = true
            // this would call ec2 describe instances command
            const instance = await this.ec2.getInstance(this.instanceId)
            const DCVconfigured = Object.values(instance.Tags!).filter(({Key, Value}) => Key === "dcvConfigured")[0].Value
            if (DCVconfigured === "true") {
                console.log(`DCV already configured on ${this.instanceId}`);
                return
            } else {
                 // if not then call runinstall on the instance
                // call ssm wrapper

                // on success, tag the instance with DCVconfigured = true
                // create tagsCommand
                await this.ec2.modifyInstanceTag(this.instanceId, "dcvConfigured", "true")
            }
        } catch (err: any) {
            throw err
        }

    }

    // 2. Verify DCV is installed and running, returns the url
    async verifyDCVInstallation(instanceId: string): Promise<string> {
        // call session creation doc in ssmwrapper

        // call get dcvstreaming url
        return ""
    }

    // 3. Get DCV streaming URL
    async getStreamingUrl(publicIp: string): Promise<string> {
        // call getinstacne in ec2 wrapper
        return ""
    }


}

export default dcvWrapper;
