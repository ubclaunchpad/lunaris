import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { DynamoDbTables } from "./constructs/storage/dynamodb-tables";

export class StorageStack extends Stack {
    public readonly runningInstancesTable: ITable;
    public readonly runningStreamsTable: ITable;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, {
            ...props,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        });

        const dynamoDbTables = new DynamoDbTables(this, "DynamoDbTables");
        this.runningInstancesTable = dynamoDbTables.runningInstancesTable;
        this.runningStreamsTable = dynamoDbTables.runningStreamsTable;
    }
}
