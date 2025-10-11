import { Construct } from "constructs";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

export class DynamoDbTables extends Construct {
  // Add your DynamoDB tables here as you need them
  // Example:
  // public readonly usersTable: Table;
  // public readonly ordersTable: Table;

  public RunningStreams: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    /*
     * RunningStreams Table Schema:
      * - instanceArn (string) - Partition Key
      * - userId (string)
      * - streamingId (string) 
      * - streamingLink (string)
     */
    this.RunningStreams = new Table(this, "RunningStreams", {
      partitionKey: { name: "instanceArn", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
    });

    // Example table - uncomment and modify as needed
    // this.usersTable = new Table(this, "UsersTable", {
    //   partitionKey: { name: "userId", type: AttributeType.STRING },
    //   billingMode: BillingMode.PAY_PER_REQUEST,
    //   removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
    // });
  }
}