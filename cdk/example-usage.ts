// Example usage of DynamoDB wrappers
import { DynamoDbTables } from "./lib/constructs/dynamodb-tables";
import {
  createDynamoDbWrapper,
  RunningStream,
  RunningInstance,
} from "./lib/constructs/dynamodb-wrapper";

// Example function showing how to use the wrappers
export async function exampleUsage() {
  // 1. Create tables (infrastructure)
  const dynamoDbTables = new DynamoDbTables(this, "DynamoDbTables");

  // 2. Create wrappers using existing tables
  const streamsWrapper = createDynamoDbWrapper(
    "streams",
    dynamoDbTables.RunningStreamsTable
  );
  const instancesWrapper = createDynamoDbWrapper(
    "instances",
    dynamoDbTables.runningInstancesTable
  );

  // 3. Use wrappers for CRUD operations

  // Create a stream
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

  // Get a stream
  const stream = await streamsWrapper.getItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0"
  );
  console.log("Retrieved stream:", stream);

  // Update a stream
  const updatedStream = await streamsWrapper.updateItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0",
    { streamingLink: "https://newstream.example.com/stream456" }
  );
  console.log("Updated stream:", updatedStream);

  // Create an instance
  const newInstance: RunningInstance = {
    instanceId: "i-1234567890abcdef0",
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

  // Query instances by status
  const runningInstances = await instancesWrapper.queryByStatus("running");
  console.log("Running instances:", runningInstances);

  // Delete a stream
  const deleted = await streamsWrapper.deleteItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0"
  );
  console.log("Stream deleted:", deleted);
}
