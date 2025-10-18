import { Construct } from "constructs";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

export class DynamoDbTables extends Construct {
  public RunningStreamsTable: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.setUpRunningStreamsTable();
  }

      /*
        * RunningStreams Table Schema:
        * - instanceArn (string) - Partition Key
        * - userId (string)
        * - streamingId (string) 
        * - streamingLink (string)
        * - createdAt (ISO 8601 formatted date string)
        * - updatedAt (ISO 8601 formatted date string)
      */
      setUpRunningStreamsTable(): void {
        this.RunningStreamsTable = new Table(this, "RunningStreams", {
          partitionKey: { name: "instanceArn", type: AttributeType.STRING },
          billingMode: BillingMode.PAY_PER_REQUEST,
          removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
      });
    }
}