import { Construct } from "constructs";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

export class DynamoDbTables extends Construct {
  // Add your DynamoDB tables here as you need them
  // Example:
  // public readonly usersTable: Table;
  // public readonly ordersTable: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Example table - uncomment and modify as needed
    // this.usersTable = new Table(this, "UsersTable", {
    //   partitionKey: { name: "userId", type: AttributeType.STRING },
    //   billingMode: BillingMode.PAY_PER_REQUEST,
    //   removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
    // });
  }
}