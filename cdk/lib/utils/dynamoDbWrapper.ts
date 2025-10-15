import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
    DynamoDBDocumentClient, 
    GetCommand,
    type TranslateConfig,
    type GetCommandInput,
} from "@aws-sdk/lib-dynamodb";


class DynamoDBWrapper {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(tableName: string, translateConfig?: TranslateConfig) {
        // DynamoDBDocumentClient allows use of native JS types rather than aws AttributeValue types
        this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), translateConfig);
        this.tableName = tableName;
    }

    async getItem(instanceArn: string, options?: Partial<GetCommandInput>) {
        const inputConfig: GetCommandInput = {
            TableName: this.tableName,
            Key: { instanceArn }, // assuming partition key is named instanceArn
            ...(options ?? {})
        }

        const response = await this.client.send(new GetCommand(inputConfig));
        return response?.Item ?? null;
    }
}

export default DynamoDBWrapper;