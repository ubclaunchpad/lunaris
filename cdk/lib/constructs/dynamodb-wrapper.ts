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

// Data model interfaces
export interface RunningStream {
  instanceArn: string;
  userId: string;
  streamingId: string;
  streamingLink: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunningInstance {
  instanceId: string;
  instanceArn: string;
  ebsVolumes: string[];
  creationTime: string;
  status: string;
  region: string;
  instanceType: string;
  lastModifiedTime: string;
}

// Abstract base wrapper class
export abstract class DynamoDbWrapper {
  protected client: DynamoDBClient;
  protected tableName: string;
  protected partitionKey: string;

  constructor(table: Table) {
    this.client = new DynamoDBClient({});
    this.tableName = table.tableName;
    this.partitionKey = table.partitionKey.attributeName;
  }

  // Common CRUD operations
  abstract createItem(item: any): Promise<any>;
  abstract getItem(key: string): Promise<any>;
  abstract updateItem(key: string, updates: any): Promise<any>;
  abstract deleteItem(key: string): Promise<any>;
  abstract queryItems(params: any): Promise<any>;
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

    await this.client.send(command);
    return stream;
  }

  async getItem(instanceArn: string): Promise<RunningStream | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceArn }),
    });

    const result = await this.client.send(command);
    return result.Item ? (unmarshall(result.Item) as RunningStream) : null;
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

    const result = await this.client.send(command);
    return unmarshall(result.Attributes!) as RunningStream;
  }

  async deleteItem(instanceArn: string): Promise<boolean> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceArn }),
    });

    await this.client.send(command);
    return true;
  }

  async queryItems(params: any): Promise<RunningStream[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      ...params,
    });

    const result = await this.client.send(command);
    return result.Items?.map((item) => unmarshall(item) as RunningStream) || [];
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

    await this.client.send(command);
    return instance;
  }

  async getItem(instanceId: string): Promise<RunningInstance | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceId }),
    });

    const result = await this.client.send(command);
    return result.Item ? (unmarshall(result.Item) as RunningInstance) : null;
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

    const result = await this.client.send(command);
    return unmarshall(result.Attributes!) as RunningInstance;
  }

  async deleteItem(instanceId: string): Promise<boolean> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ [this.partitionKey]: instanceId }),
    });

    await this.client.send(command);
    return true;
  }

  async queryItems(params: any): Promise<RunningInstance[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      ...params,
    });

    const result = await this.client.send(command);
    return (
      result.Items?.map((item) => unmarshall(item) as RunningInstance) || []
    );
  }

  // Table-specific method for status queries
  async queryByStatus(status: string): Promise<RunningInstance[]> {
    return this.queryItems({
      IndexName: "StatusCreationTimeIndex",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: marshall({ ":status": status }),
    });
  }
}

// Factory function
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
