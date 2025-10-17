import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
    DynamoDBDocumentClient, 
    GetCommand,
    PutCommand,
    type TranslateConfig,
    type GetCommandInput,
    type PutCommandInput,
    type GetCommandOutput,
} from "@aws-sdk/lib-dynamodb";


class DynamoDBWrapper {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(tableName: string, translateConfig?: TranslateConfig) {
        // DynamoDBDocumentClient allows use of native JS types rather than aws AttributeValue types
        this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), translateConfig);
        this.tableName = tableName;
    }

    async getItem(key: GetCommandInput["Key"], options?: Partial<GetCommandInput>): Promise<GetCommandOutput["Item"] | null> {
        const inputConfig: GetCommandInput = {
            TableName: this.tableName,
            Key: key,
            ...(options ?? {})
        }

        const response = await this.client.send(new GetCommand(inputConfig));
        return response?.Item ?? null;
    }

    async putItem(Item: PutCommandInput["Item"], options?: Partial<PutCommandInput>) {
        const inputConfig: PutCommandInput = {
            TableName: this.tableName,
            Item,
            ...(options ?? {})
        }
        
        await this.client.send(new PutCommand(inputConfig));
    }
}

export default DynamoDBWrapper;