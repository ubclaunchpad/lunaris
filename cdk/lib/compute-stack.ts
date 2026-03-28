import { Stack, StackProps } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Function } from "aws-cdk-lib/aws-lambda";
import { LambdaFunctions } from "./constructs/compute/lambda-functions";
import { StepFunctions } from "./constructs/compute/step-functions";
import { DCVSecurityGroup } from "./constructs/compute/dcv-security-group";

export interface ComputeStackProps extends StackProps {
    readonly ec2InstanceProfileArn: string;
    readonly ec2InstanceProfileName: string;
    readonly runningInstancesTable: ITable;
    readonly runningStreamsTable: ITable;
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

        const { runningInstancesTable, runningStreamsTable } = props;

        const dcvSecurityGroup = new DCVSecurityGroup(this, "DCVSecurityGroup");

        const lambdaFunctions = new LambdaFunctions(this, "LambdaFunctions", {
            runningInstancesTable,
            runningStreamsTable,
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
        });

        this.grantDynamoDbPermissions(lambdaFunctions, runningInstancesTable, runningStreamsTable);

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
    ): void {
        // API Lambda
        runningInstancesTable.grantReadWriteData(lambdaFunctions.apiFunction);
        runningStreamsTable.grantReadData(lambdaFunctions.apiFunction);

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
        runningInstancesTable.grantWriteData(
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
        runningInstancesTable.grantWriteData(
            lambdaFunctions.getFunction("updateRunningInstancesTerminateFunction"),
        );
    }
}
