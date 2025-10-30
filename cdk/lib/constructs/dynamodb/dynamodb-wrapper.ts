import { Table } from "aws-cdk-lib/aws-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

// Data model interfaces - These data models should match the data schema design
export interface RunningStream {
  streamingId: string;
  instanceArn: string;
  userId: string;
  streamingLink: string;
}

export interface RunningInstance {
  instanceId: string;
  instanceArn: string;
  userId: string;
  ebsVolumes: string[];
  creationTime: string;
  status: "running" | "stopped" | "terminated";
  region: string;
  instanceType: string;
  lastModifiedTime: string;
}

export abstract class DynamoDbWrapper {
  protected client: DynamoDBClient;
  protected tableName: string;
  protected partitionKey: string;

  constructor(table: Table) {
    this.client = new DynamoDBClient({});
    this.tableName = table.tableName;
    this.partitionKey = table.schema().partitionKey.name;
  }

  // Common CRUD operations
  abstract createItem(item: RunningInstance | RunningStream): Promise<any>;
  abstract getItem(key: string): Promise<any>;
  abstract updateItem(key: string, updates: any): Promise<any>;
  abstract deleteItem(key: string): Promise<any>;
  abstract queryItems(params: any): Promise<any>;

  async queryItemsByUserId(userId: string): Promise<RunningInstance[]> {
    return this.queryItems({
      IndexName: "UserIdIndex",
      KeyConditionExpression: "#userId = :userId",
      ExpressionAttributeNames: { "#userId": "userId" },
      ExpressionAttributeValues: marshall({ ":userId": userId }),
    });
  }
}

// Running Streams Wrapper
export class RunningStreamWrapper extends DynamoDbWrapper {
  constructor(table: Table) {
    super(table);
  }

  async createItem(stream: RunningStream): Promise<RunningStream> {
    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(stream),
    });

    try {
      await this.client.send(command);
      return stream;
    } catch (error) {
      console.error("Error creating stream:", error);
      throw new Error(
        `Failed to create stream: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  //finds the item by its partition key: instanceArn
  async getItem(instanceArn: string): Promise<RunningStream | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceArn }),
    });

    try {
      const result = await this.client.send(command);
      return result.Item ? (unmarshall(result.Item) as RunningStream) : null;
    } catch (error) {
      console.error("Error getting stream:", error);
      throw new Error(
        `Failed to get stream: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async updateItem(
    instanceArn: string,
    updates: Partial<RunningStream>
  ): Promise<RunningStream> {
    const updateExpression = Object.keys(updates)
      .map((key, index) => `#${key} = :val${index}`)
      .join(", ");

    const expressionAttributeNames = Object.keys(updates).reduce(
      (acc, key) => ({ ...acc, [`#${key}`]: key }),
      {}
    );

    const expressionAttributeValues = Object.values(updates).reduce(
      (acc, value, index) => ({ ...acc, [`:val${index}`]: value }),
      {}
    );

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceArn }),
      UpdateExpression: `SET ${updateExpression}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ReturnValues: "ALL_NEW",
    });

    try {
      const result = await this.client.send(command);
      return unmarshall(result.Attributes!) as RunningStream;
    } catch (error) {
      console.error("Error updating stream:", error);
      throw new Error(
        `Failed to update stream: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async deleteItem(instanceArn: string): Promise<boolean> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceArn }),
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error("Error deleting stream:", error);
      throw new Error(
        `Failed to delete stream: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  //find all the items matching params criteria
  async queryItems(params: any): Promise<RunningStream[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      ...params,
    });

    try {
      const result = await this.client.send(command);
      return (
        result.Items?.map((item: any) => unmarshall(item) as RunningStream) ||
        []
      );
    } catch (error) {
      console.error("Error querying streams:", error);
      throw new Error(
        `Failed to query streams: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

// Running Instances Wrapper
export class RunningInstanceWrapper extends DynamoDbWrapper {
  constructor(table: Table) {
    super(table);
  }

  async createItem(instance: RunningInstance): Promise<RunningInstance> {
    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(instance),
    });

    try {
      await this.client.send(command);
      return instance;
    } catch (error) {
      console.error("Error creating instance:", error);
      throw new Error(
        `Failed to create instance: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async getItem(instanceId: string): Promise<RunningInstance | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceId }),
    });

    try {
      const result = await this.client.send(command);
      return result.Item ? (unmarshall(result.Item) as RunningInstance) : null;
    } catch (error) {
      console.error("Error getting instance:", error);
      throw new Error(
        `Failed to get instance: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async updateItem(
    instanceId: string,
    updates: Partial<RunningInstance>
  ): Promise<RunningInstance> {
    const updateExpression = Object.keys(updates)
      .map((key, index) => `#${key} = :val${index}`)
      .join(", ");

    const expressionAttributeNames = Object.keys(updates).reduce(
      (acc, key) => ({ ...acc, [`#${key}`]: key }),
      {}
    );

    const expressionAttributeValues = Object.values(updates).reduce(
      (acc, value, index) => ({ ...acc, [`:val${index}`]: value }),
      {}
    );

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceId }),
      UpdateExpression: `SET ${updateExpression}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ReturnValues: "ALL_NEW",
    });

    try {
      const result = await this.client.send(command);
      return unmarshall(result.Attributes!) as RunningInstance;
    } catch (error) {
      console.error("Error updating instance:", error);
      throw new Error(
        `Failed to update instance: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async deleteItem(instanceId: string): Promise<boolean> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceId }),
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error("Error deleting instance:", error);
      throw new Error(
        `Failed to delete instance: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async queryItems(params: any): Promise<RunningInstance[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      ...params,
    });

    try {
      const result = await this.client.send(command);
      return (
        result.Items?.map((item) => unmarshall(item) as RunningInstance) || []
      );
    } catch (error) {
      console.error("Error querying instances:", error);
      throw new Error(
        `Failed to query instances: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Table-specific method for status queries
  async queryItemsByStatus(status: string): Promise<RunningInstance[]> {
    return this.queryItems({
      IndexName: "StatusCreationTimeIndex",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: marshall({ ":status": status }),
    });
  }

  async queryItemsByRegion(region: string): Promise<RunningInstance[]> {
    return this.queryItems({
      IndexName: "RegionIndex",
      KeyConditionExpression: "#region = :region",
      ExpressionAttributeNames: { "#region": "region" },
      ExpressionAttributeValues: marshall({ ":region": region }),
    });
  }
}

// Factory function - should be used to create appropriate dynamodbwrapper
export function createDynamoDbWrapper(
  tableType: "streams" | "instances",
  table: Table
): DynamoDbWrapper {
  switch (tableType) {
    case "streams":
      return new RunningStreamWrapper(table);
    case "instances":
      return new RunningInstanceWrapper(table);
    default:
      throw new Error(`Unknown table type: ${tableType}`);
  }
}
