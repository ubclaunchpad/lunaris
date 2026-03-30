import { Stack, StackProps } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Function } from "aws-cdk-lib/aws-lambda";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { LambdaFunctions } from "./constructs/compute/lambda-functions";
import { StepFunctions } from "./constructs/compute/step-functions";
import { DCVSecurityGroup } from "./constructs/compute/dcv-security-group";

export interface ComputeStackProps extends StackProps {
    readonly ec2InstanceProfileArn: string;
    readonly ec2InstanceProfileName: string;
    readonly runningInstancesTable: ITable;
    readonly runningStreamsTable: ITable;
    readonly userPaymentsTable: ITable;
    readonly userBalancesTable: ITable;
    readonly gamesTable: ITable;
}

export class ComputeStack extends Stack {
    public readonly apiFunction: Function;

    constructor(scope: Construct, id: string, props: ComputeStackProps) {
        super(scope, id, {
            ...props,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        });

        const {
            runningInstancesTable,
            runningStreamsTable,
            userPaymentsTable,
            userBalancesTable,
            gamesTable,
        } = props;

        const dcvSecurityGroup = new DCVSecurityGroup(this, "DCVSecurityGroup");

        const lambdaFunctions = new LambdaFunctions(this, "LambdaFunctions", {
            runningInstancesTable,
            runningStreamsTable,
            gamesTable,
            baseEbsSnapshotId: process.env.BASE_EBS_SNAPSHOT_ID,
            ec2InstanceProfileArn: props.ec2InstanceProfileArn,
            ec2InstanceProfileName: props.ec2InstanceProfileName,
            dcvSecurityGroupId: dcvSecurityGroup.securityGroupId,
            frontendUrl: process.env.FRONTEND_URL,
            stripeSecretKey: process.env.STRIPE_SECRET_KEY,
            stripePriceStarter: process.env.STRIPE_PRICE_ID_STARTER,
            stripePriceBasic: process.env.STRIPE_PRICE_ID_BASIC,
            stripePriceStandard: process.env.STRIPE_PRICE_ID_STANDARD,
            stripePricePremium: process.env.STRIPE_PRICE_ID_PREMIUM,
            stripePricePro: process.env.STRIPE_PRICE_ID_PRO,
            userPaymentsTable,
            userBalancesTable,
            stripeWhSecret: process.env.STRIPE_WH_SECRET,
        });

        this.grantDynamoDbPermissions(
            lambdaFunctions,
            runningInstancesTable,
            runningStreamsTable,
            userPaymentsTable,
            userBalancesTable,
            gamesTable,
        );
        this.setupOperationalMetricsScheduler(lambdaFunctions);

        const stepFunctions = new StepFunctions(this, "StepFunctions", {
            functions: lambdaFunctions.functions,
        });

        cdk.Tags.of(stepFunctions).add("Component", "StepFunctions");
        cdk.Tags.of(stepFunctions).add("ManagedBy", "CDK");

        const deployWorkflow = stepFunctions.getWorkflow("UserDeployEC2Workflow");
        if (!deployWorkflow) {
            throw new Error("UserDeployEC2Workflow not found");
        }

        const terminateWorkflow = stepFunctions.getWorkflow("UserTerminateEC2Workflow");
        if (!terminateWorkflow) {
            throw new Error("UserTerminateEC2Workflow not found");
        }

        // Grant API Lambda permission to start and inspect Step Function executions
        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["states:StartExecution"],
                resources: [deployWorkflow.stateMachineArn, terminateWorkflow.stateMachineArn],
            }),
        );

        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["states:DescribeExecution", "states:GetExecutionHistory"],
                resources: [
                    `arn:aws:states:${this.region}:${this.account}:execution:${deployWorkflow.stateMachineName}:*`,
                    `arn:aws:states:${this.region}:${this.account}:execution:${terminateWorkflow.stateMachineName}:*`,
                ],
            }),
        );

        lambdaFunctions.apiFunction.addEnvironment(
            "USER_DEPLOY_EC2_WORKFLOW_ARN",
            deployWorkflow.stateMachineArn,
        );
        lambdaFunctions.apiFunction.addEnvironment(
            "TERMINATE_WORKFLOW_ARN",
            terminateWorkflow.stateMachineArn,
        );

        // Grant EC2 permissions to unified API Lambda
        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                actions: ["ec2:RunInstances", "ec2:CreateTags", "ec2:DescribeInstances"],
                resources: [`arn:aws:ec2:${this.region}:${this.account}:subnet/subnet-12345678`],
            }),
        );

        this.apiFunction = lambdaFunctions.apiFunction;
    }

    private grantDynamoDbPermissions(
        lambdaFunctions: LambdaFunctions,
        runningInstancesTable: ITable,
        runningStreamsTable: ITable,
        userPaymentsTable: ITable,
        userBalancesTable: ITable,
        gamesTable: ITable,
    ): void {
        // API Lambda
        runningInstancesTable.grantReadWriteData(lambdaFunctions.apiFunction);
        runningStreamsTable.grantReadData(lambdaFunctions.apiFunction);
        userPaymentsTable.grantReadWriteData(lambdaFunctions.apiFunction);
        userBalancesTable.grantReadWriteData(lambdaFunctions.apiFunction);
        gamesTable.grantReadData(lambdaFunctions.apiFunction);

        // Deploy workflow
        runningInstancesTable.grantReadWriteData(lambdaFunctions.getFunction("deployEC2Function"));
        runningStreamsTable.grantReadData(
            lambdaFunctions.getFunction("checkRunningStreamsFunction"),
        );
        runningStreamsTable.grantWriteData(
            lambdaFunctions.getFunction("updateRunningStreamsFunction"),
        );
        runningStreamsTable.grantReadData(lambdaFunctions.getFunction("getDcvConfigFunction"));
        runningInstancesTable.grantReadData(
            lambdaFunctions.getFunction("checkRunningInstancesFunction"),
        );
        runningInstancesTable.grantReadWriteData(
            lambdaFunctions.getFunction("updateRunningInstancesFunction"),
        );

        // Terminate workflow
        runningStreamsTable.grantReadData(
            lambdaFunctions.getFunction("checkRunningStreamsTerminateFunction"),
        );
        runningInstancesTable.grantReadWriteData(
            lambdaFunctions.getFunction("terminateEC2Function"),
        );
        runningStreamsTable.grantWriteData(
            lambdaFunctions.getFunction("updateRunningStreamsTerminateFunction"),
        );
        runningInstancesTable.grantReadWriteData(lambdaFunctions.getFunction("stopEC2Function"));
        runningInstancesTable.grantReadData(
            lambdaFunctions.getFunction("checkRunningInstancesTerminateFunction"),
        );
        runningInstancesTable.grantReadWriteData(
            lambdaFunctions.getFunction("updateRunningInstancesTerminateFunction"),
        );

        // Scheduled operational metric publisher
        runningInstancesTable.grantReadData(
            lambdaFunctions.getFunction("publishActiveInstancesMetricFunction"),
        );
    }

    private setupOperationalMetricsScheduler(lambdaFunctions: LambdaFunctions): void {
        const publishActiveInstancesMetricFunction = lambdaFunctions.getFunction(
            "publishActiveInstancesMetricFunction",
        );

        new Rule(this, "PublishActiveInstancesMetricSchedule", {
            description:
                "Publishes ActiveInstancesReconciled (DynamoDB snapshot) to CloudWatch every 5 minutes",
            schedule: Schedule.rate(cdk.Duration.minutes(5)),
            targets: [new LambdaFunction(publishActiveInstancesMetricFunction)],
        });
    }
}
