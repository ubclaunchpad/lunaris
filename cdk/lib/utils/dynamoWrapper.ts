import { 
    DynamoDBClient, 
    GetItemCommand, 
    // PutItemCommand, 
    type DynamoDBClientConfig, 
    type GetItemCommandInput 
} from "@aws-sdk/client-dynamodb";

class DynamoDBWrapper {
    private client: DynamoDBClient;
    private tableName: string;
    
    constructor(tableName: string, config?: DynamoDBClientConfig) {
        this.client = new DynamoDBClient(config ?? {});
        this.tableName = tableName;
    }

    async getItem(instanceArn: string, config?: GetItemCommandInput) {
        const inputConfig: GetItemCommandInput = {
            TableName: this.tableName,
            Key: {
                instanceArn: { S: instanceArn } // hard coded instanceArn as name of partition key as this seems to be current standard
            },
            ...config
        }
        
        const response = await this.client.send(new GetItemCommand(inputConfig));
        return response?.Item ?? null;
    }

    // TODO: add putItem
}

export default DynamoDBWrapper;