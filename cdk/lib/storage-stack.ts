import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { DynamoDbTables } from "./constructs/storage/dynamodb-tables";

export class StorageStack extends Stack {
    public readonly runningInstancesTable: ITable;
    public readonly runningStreamsTable: ITable;
    public readonly userPaymentsTable: ITable;
    public readonly userBalancesTable: ITable;
    public readonly gamesTable: ITable;

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
        this.userPaymentsTable = dynamoDbTables.userPaymentsTable;
        this.userBalancesTable = dynamoDbTables.userBalancesTable;
        this.gamesTable = dynamoDbTables.gamesTable;
    }
}
