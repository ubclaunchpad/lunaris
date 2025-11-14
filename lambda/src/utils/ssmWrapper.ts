import { readFileSync } from "fs";
import { join } from "path";
import {
    SendCommandCommand,
    GetDocumentCommand,
    SSMClient,
    CreateDocumentCommand,
    type CreateDocumentCommandInput,
    type SendCommandCommandInput
} from "@aws-sdk/client-ssm";

const INSTALL_DCV_DOCUMENT_NAME = "Lunaris-Install-DCV-Document"; // ✅ Fixed typo

interface InstallDCVParams {
    instanceId: string;
    dcvMsiUrl?: string | undefined;
    sessionName?: string | undefined;
    sessionOwner?: string | undefined;
}

class SSMWrapper {
    private client: SSMClient;

    constructor() {
        this.client = new SSMClient();
    }

    async runInstall(params: InstallDCVParams): Promise<string> {
        try {
            // Check if document exists, create if not
            await this.ensureDocumentExists();

            // Send SSM command with parameters
            const commandId = await this.sendSSMCommand(
                params.instanceId,
                INSTALL_DCV_DOCUMENT_NAME,
                {
                    DcvMsiUrl: params.dcvMsiUrl ? [params.dcvMsiUrl] : [],
                    SessionName: params.sessionName ? [params.sessionName] : [],
                    SessionOwner: params.sessionOwner ? [params.sessionOwner] : []
                }
            );

            return commandId;

        } catch (err: any) {
            console.error('Failed to run DCV installation:', err);
            throw err;
        }
    }

     async runCreateSession() {
        try {

            // then pass this doc to ssmCommand

        } catch (err: any) {

        }
    }



    private async ensureDocumentExists(): Promise<void> {
        try {
            await this.getDocument();
        } catch (err: any) {
            if (err.name === 'InvalidDocument') {
                await this.createDocument();
            } else {
                throw err;
            }
        }
    }

    private async sendSSMCommand(
        instanceId: string,
        documentName: string,
        parameters?: { [key: string]: string[] }
    ): Promise<string> {
        try {
            const input: SendCommandCommandInput = {
                InstanceIds: [instanceId],
                DocumentName: documentName,
                Parameters: parameters,
                TimeoutSeconds: 600,
                Comment: `Lunaris DCV installation on ${instanceId}`
            };

            const command = new SendCommandCommand(input);
            const response = await this.client.send(command);

            if (!response.Command?.CommandId) {
                throw new Error('No CommandId returned from SSM');
            }

            return response.Command.CommandId;

        } catch (err: any) {
            console.error('Sending SSM command failed:', err);
            throw err;
        }
    }

    private async getDocument(): Promise<string> {
        try {
            const response = await this.client.send(
                new GetDocumentCommand({ Name: INSTALL_DCV_DOCUMENT_NAME })
            );

            if (!response.Name) {
                throw new Error('Document exists but has no name');
            }

            return response.Name;

        } catch (error: any) {
            throw error;
        }
    }

    private async createDocument(): Promise<void> {
        try {
            const yamlPath = join(__dirname, "../documents/install_dcv.yml");
            const yamlContent = readFileSync(yamlPath, "utf-8");

            const input: CreateDocumentCommandInput = {
                Content: yamlContent,
                Name: INSTALL_DCV_DOCUMENT_NAME,
                DocumentFormat: "YAML",
                DocumentType: "Command",
                Tags: [
                    { Key: "Application", Value: "Lunaris" },
                    { Key: "ManagedBy", Value: "Lambda" }
                ]
            };

            const command = new CreateDocumentCommand(input);
            await this.client.send(command);

        } catch (error: any) {
            if (error.name === 'DocumentAlreadyExistsException') {
                return;
            }
            console.error('Failed to create SSM document:', error);
            throw error;
        }
    }
}

export default SSMWrapper;
