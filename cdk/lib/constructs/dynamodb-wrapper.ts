import { Construct } from "constructs";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { AttributeType } from "aws-cdk-lib/aws-dynamodb";
import {
  indexKey,
  indexSortKey,
  indexName,
  indexType,
} from "aws-cdk-lib/aws-dynamodb";

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

export class RunningStreamsTable extends DynamoDbWrapper {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      tableName: "RunningStreams",
      partitionKey: "instanceArn",
    });
  }
  createItem(item: any): Promise<void> {
    return await this.table.putItem({
      Item: item,
    });
  }
  getItem(key: string): Promise<any> {
    return this.table.getItem(key);
  }
  updateItem(key: string, item: any): Promise<void> {
    return await this.table.updateItem({
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

export class RunningInstanceTable extends DynamoDbWrapper {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      tableName: "RunningInstances",
      partitionKey: "instanceId",
    });
  }
  createItem(item: any): Promise<void> {
    return await this.table.putItem({
      Item: item,
    });
  }
  getItem(key: string): Promise<any> {
    return this.table.getItem(key);
  }
  updateItem(key: string, item: any): Promise<void> {
    return await this.table.updateItem({
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

export class DynamoDbWrapperFactory extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }
  // Single factory function (not a class)
  createDynamoDbWrapper(
    tableType: "streams" | "instances",
    table: Table
  ): DynamoDbWrapper {
    switch (tableType) {
      case "streams":
        return new RunningStreamsTable(this, table);
      case "instances":
        return new RunningInstanceTable(this, table);
      default:
        throw new Error(`Unknown table type: ${tableType}`);
    }
  }
}
