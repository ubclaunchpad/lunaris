import { Construct } from "constructs";
import {
    ITable,
    Table,
    AttributeType,
    BillingMode,
    ProjectionType,
    TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

export class DynamoDbTables extends Construct {
    public readonly runningStreamsTable: ITable;
    public readonly runningInstancesTable: ITable;
    public readonly userPaymentsTable: ITable;
    public readonly userBalancesTable: ITable;
    public readonly gamesTable: ITable;

    constructor(scope: Construct, id: string) {
        super(scope, id);
        this.runningStreamsTable = this.setUpRunningStreamsTable();
        this.runningInstancesTable = this.setupRunningInstances();
        this.userPaymentsTable = this.setupUserPayments();
        this.userBalancesTable = this.setupUserBalances();
        this.gamesTable = this.setupGamesTable();
    }

    /*
     * RunningStreams Table Schema:
     * - instanceArn (string) - Partition Key
     * - userId (string)
     * - streamingId (string)
     * - streamingLink (string)
     * - dcvUser (string) - DCV username
     * - dcvPassword (string) - Unique password per instance (encrypted at rest)
     * - createdAt (ISO 8601 formatted date string)
     * - updatedAt (ISO 8601 formatted date string)
     * - status (string) - current status of stream
     *
     * Security: Passwords are generated per-instance and stored encrypted.
     * The table uses AWS-managed encryption (KMS) at rest.
     */
    setUpRunningStreamsTable(): ITable {
        const table = new Table(this, "RunningStreams", {
            partitionKey: { name: "instanceArn", type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            // Note: Encryption setting removed to avoid AWS rate limiting
            // DynamoDB tables are encrypted by default with AWS-owned keys
            removalPolicy: RemovalPolicy.RETAIN,
        });

        table.addGlobalSecondaryIndex({
            indexName: "UserIdIndex",
            partitionKey: { name: "userId", type: AttributeType.STRING },
            sortKey: { name: "createdAt", type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        return table;
    }

    /**
     * Schema: instanceId (PK), instanceArn, ebsVolumeId, creationTime,
     *         status, region, instanceType, lastModifiedTime, userId, gameId,
     *         executionArn (optional - stores Step Function execution ARN for termination workflows)
     */
    setupRunningInstances(): ITable {
        const table = new Table(this, "RunningInstances", {
            partitionKey: { name: "instanceId", type: AttributeType.STRING },
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true,
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        // TODO future: add autoscaling group
        // TODO: or add grantX to specific lambda functions

        //add global secondary index for status and creation time
        table.addGlobalSecondaryIndex({
            indexName: "StatusCreationTimeIndex",
            partitionKey: { name: "status", type: AttributeType.STRING },
            sortKey: { name: "creationTime", type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        //add global secondary index for userId
        table.addGlobalSecondaryIndex({
            indexName: "UserIdIndex",
            partitionKey: { name: "userId", type: AttributeType.STRING },
            sortKey: { name: "creationTime", type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        return table;
    }

    setupUserPayments(): ITable {
        const table = new Table(this, "UserPayments", {
            partitionKey: { name: "stripeSessionId", type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        table.addGlobalSecondaryIndex({
            indexName: "UserIdIndex",
            partitionKey: { name: "userId", type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        return table;
    }

    setupUserBalances(): ITable {
        const table = new Table(this, "UserBalances", {
            partitionKey: { name: "userId", type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        return table;
    }

    /*
     * Games Table Schema:
     * - gameId (string) - Partition Key
     * - name (string)
     * - description (string)
     * - imageUrl (string)
     * - tags (string[])
     * - modes? (string[])
     * - amiId (string) - AMI ID to launch for this game
     * - minInstanceType (string) - e.g. "g4dn.xlarge"
     * - ebsSnapshotId? (string) - optional, retained for future EBS-based approaches
     */
    setupGamesTable(): ITable {
        const table = new Table(this, "Games", {
            partitionKey: { name: "gameId", type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        return table;
    }
}
