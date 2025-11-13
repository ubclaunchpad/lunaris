// Example usage of DynamoDB wrappers
import { Construct } from "constructs";
import { DynamoDbTables } from "../dynamodb-tables";
import {
  createDynamoDbWrapper,
  RunningStream,
  RunningInstance,
  RunningStreamWrapper,
  RunningInstanceWrapper,
} from "./dynamodb-wrapper";
import { Table } from "aws-cdk-lib/aws-dynamodb";

/**
 * Example function showing how to use the wrappers
 * Note: This is for demonstration only. In actual CDK code, you would use this function
// within a Stack or Construct class where 'this' refers to the construct scope.
 * @param scope 
 */
export async function exampleUsage(scope: Construct) {
  // 1. Create tables (infrastructure)
  const dynamoDbTables = new DynamoDbTables(scope, "DynamoDbTables");

  // 2. Create wrappers using existing tables
  const streamsWrapper = createDynamoDbWrapper(
    "streams",
    dynamoDbTables.getRunningStreamsTable() as Table
  ) as RunningStreamWrapper;
  const instancesWrapper = createDynamoDbWrapper(
    "instances",
    dynamoDbTables.getRunningInstanceTable() as Table
  ) as RunningInstanceWrapper;

  // 3. Use wrappers for CRUD operations
  const newStream: RunningStream = {
    instanceArn:
      "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0",
    userId: "user123",
    streamingId: "stream456",
    streamingLink: "https://stream.example.com/stream456",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createdStream = await streamsWrapper.createItem(newStream);
  console.log("Created stream:", createdStream);

  const stream = await streamsWrapper.getItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0"
  );
  console.log("Retrieved stream:", stream);

  const updatedStream = await streamsWrapper.updateItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0",
    { streamingLink: "https://newstream.example.com/stream456" }
  );
  console.log("Updated stream:", updatedStream);

  const newInstance: RunningInstance = {
    instanceId: "i-1234567890abcdef0",
    userId: "user123",
    instanceArn:
      "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0",
    ebsVolumes: ["vol-1234567890abcdef0"],
    creationTime: new Date().toISOString(),
    status: "running",
    region: "us-east-1",
    instanceType: "t3.micro",
    lastModifiedTime: new Date().toISOString(),
  };

  const createdInstance = await instancesWrapper.createItem(newInstance);
  console.log("Created instance:", createdInstance);

  const runningInstances = await instancesWrapper.queryItemsByStatus("running");
  console.log("Running instances:", runningInstances);

  const deleted = await streamsWrapper.deleteItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0"
  );
  console.log("Stream deleted:", deleted);
}
