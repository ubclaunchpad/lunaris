import { Construct } from "constructs";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { DynamoDbWrapperProps } from "./dynamodb-table-props";

export abstract class DynamoDbWrapper extends Construct {
  protected table: Table;
  protected partitionKey: string;
  protected sortKey?: string;
  protected indexKey?: string;
  protected indexSortKey?: string;
  protected indexName?: string;
  protected indexType?: string;
  constructor(scope: Construct, id: string, props: DynamoDbWrapperProps) {
    super(scope, id);
    this.table = new Table(this, props.tableName, {
      partitionKey: { name: props.partitionKey, type: AttributeType.STRING },
      sortKey: { name: props.sortKey, type: AttributeType.STRING },
    });
  }

  //crud operations
  abstract createItem(item: any): Promise<any>;
  abstract getItem(key: string): Promise<any>;
  abstract updateItem(key: string, item: any): Promise<void>;
  abstract deleteItem(key: string): Promise<any>;
}

export class RunningStreamWrapper extends DynamoDbWrapper {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      tableName: "RunningStreams",
      partitionKey: "instanceArn",
    });
  }
  createItem(item: any): Promise<void> {
    return this.table.putItem({
      Item: item,
    });
  }
  getItem(key: string): Promise<any> {
    return this.table.getItem(key);
  }
  updateItem(key: string, item: any): Promise<void> {
    return this.table.updateItem({
      Key: {
        [this.partitionKey]: key,
      },
      UpdateExpression: "set #item = :item",
      ExpressionAttributeNames: {
        "#item": item,
      },
    });
  }
  deleteItem(key: string): Promise<any> {
    return await this.table.deleteItem({
      Key: {
        [this.partitionKey]: key,
      },
    });
  }
}

export class RunningInstanceWrapper extends DynamoDbWrapper {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      tableName: "RunningInstances",
      partitionKey: "instanceId",
    });
  }
  createItem(item: any): Promise<void> {
    return this.table.putItem({
      Item: item,
    });
  }
  getItem(key: string): Promise<any> {
    return this.table.getItem(key);
  }
  updateItem(key: string, item: any): Promise<void> {
    return this.table.updateItem({
      Key: {
        [this.partitionKey]: key,
      },
      UpdateExpression: "set #item = :item",
      ExpressionAttributeNames: {
        "#item": item,
      },
    });
  }
  deleteItem(key: string): Promise<any> {
    return this.table.deleteItem({
      Key: {
        [this.partitionKey]: key,
      },
    });
  }
}

export function createDynamoDbWrapper(
  tableType: "streams" | "instances",
  table: Table
): DynamoDbWrapper {
  switch (tableType) {
    case "streams":
      return new RunningStreamWrapper(this, table);
    case "instances":
      return new RunningInstanceWrapper(this, table);
    default:
      throw new Error(`Unknown table type: ${tableType}`);
  }
}
