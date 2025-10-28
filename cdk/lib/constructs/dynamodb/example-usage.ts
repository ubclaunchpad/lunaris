// Example usage of DynamoDB wrappers
import { DynamoDbTables } from "./dynamodb-tables";
import {
  createDynamoDbWrapper,
  RunningStream,
  RunningInstance,
  RunningStreamWrapper,
  RunningInstanceWrapper,
} from "./dynamodb-wrapper";

// Example function showing how to use the wrappers
export async function exampleUsage(this: any) {
  // 1. Create tables (infrastructure)
  const dynamoDbTables = new DynamoDbTables(this, "DynamoDbTables");

  // 2. Create wrappers using existing tables
  const streamsWrapper = createDynamoDbWrapper(
    "streams",
    dynamoDbTables.runningStreamsTable
  ) as RunningStreamWrapper;
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
  };

  const createdStream = await streamsWrapper.createItem(newStream);
  console.log("Created stream:", createdStream);

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

  //de
  const deletedStream = await streamsWrapper.deleteItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0"
  );
  console.log("Deleted stream:", deletedStream);

  // ------------------------------------------------------------
  // Running Instances
  // Create an instance
  const newInstance: RunningInstance = {
    instanceId: "i-1234567890abcdef0",
    userId: "user123",
    instanceArn:
      "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0",
    ebsVolumes: [
      "vol-1234567890abcdef0",
      "vol-1234567890abcdef1",
      "vol-1234567890abcdef2",
      "vol-1234567890abcdef3",
      "vol-1234567890abcdef4",
      "vol-1234567890abcdef5",
      "vol-1234567890abcdef6",
      "vol-1234567890abcdef7",
      "vol-1234567890abcdef8",
      "vol-1234567890abcdef9",
    ],
    creationTime: new Date().toISOString(),
    status: "running",
    region: "us-east-1",
    instanceType: "t3.micro",
    lastModifiedTime: new Date().toISOString(),
  };

  const createdInstance = await instancesWrapper.createItem(newInstance);
  console.log("Created instance:", createdInstance);

  // Query instances by status
  const runningInstances = await instancesWrapper.queryItemsByUserId("user123");
  console.log("Running instances:", runningInstances);

  // Delete a stream
  const deleted = await streamsWrapper.deleteItem(
    "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0"
  );
  console.log("Stream deleted:", deleted);
}
