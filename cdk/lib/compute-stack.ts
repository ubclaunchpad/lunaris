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

        // Create Security Group for DCV instances (ports 8443, 80, 3389)
        const dcvSecurityGroup = new DCVSecurityGroup(this, "DCVSecurityGroup");

        // Create all Lambda functions
        const lambdaFunctions = new LambdaFunctions(this, "LambdaFunctions", {
            runningInstancesTable,
            runningStreamsTable,
            ec2InstanceProfileArn: props.ec2InstanceProfileArn,
            ec2InstanceProfileName: props.ec2InstanceProfileName,
            dcvSecurityGroupId: dcvSecurityGroup.securityGroupId,
            stripeSecretKey: process.env.STRIPE_SECRET_KEY,
        });

        // Grant EC2 permissions to unified API Lambda
        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                actions: ["ec2:RunInstances", "ec2:CreateTags", "ec2:DescribeInstances"],
                resources: [`arn:aws:ec2:${this.region}:${this.account}:subnet/subnet-12345678`],
            }),
        );

        // Grant DynamoDB permissions to unified API Lambda
        runningInstancesTable.grantReadWriteData(lambdaFunctions.apiFunction);
        runningStreamsTable.grantReadData(lambdaFunctions.apiFunction);

        // Grant DynamoDB permissions for workflow Lambda functions
        runningInstancesTable.grantReadWriteData(lambdaFunctions.deployEC2Function);
        runningStreamsTable.grantReadData(
            lambdaFunctions.checkRunningStreamsFunction,
        );
        runningStreamsTable.grantWriteData(
            lambdaFunctions.updateRunningStreamsFunction,
        );

        // Grant DynamoDB permissions for UserTerminateEC2 workflow
        runningStreamsTable.grantReadData(
            lambdaFunctions.checkRunningStreamsTerminateFunction,
        );
        runningInstancesTable.grantReadWriteData(
            lambdaFunctions.terminateEC2Function,
        );
        runningStreamsTable.grantWriteData(
            lambdaFunctions.updateRunningStreamsTerminateFunction,
        );

        // Create Step Functions with consistent naming and tagging
        const stepFunctions = new StepFunctions(this, "StepFunctions", {
            checkRunningStreamsFunction: lambdaFunctions.checkRunningStreamsFunction,
            deployEC2Function: lambdaFunctions.deployEC2Function,
            configureDcvInstanceFunction: lambdaFunctions.configureDcvInstanceFunction,
            updateRunningStreamsFunction: lambdaFunctions.updateRunningStreamsFunction,
            checkRunningStreamsTerminateFunction:
                lambdaFunctions.checkRunningStreamsTerminateFunction,
            terminateEC2Function: lambdaFunctions.terminateEC2Function,
            updateRunningStreamsTerminateFunction:
                lambdaFunctions.updateRunningStreamsTerminateFunction,
        });

        // Apply consistent tags to Step Functions resources
        cdk.Tags.of(stepFunctions).add("Component", "StepFunctions");
        cdk.Tags.of(stepFunctions).add("ManagedBy", "CDK");

        const terminateWorkflow = stepFunctions.getWorkflow("UserTerminateEC2Workflow");
        if (!terminateWorkflow) {
            throw new Error("UserTerminateEC2Workflow not found");
        }

        const deployWorkflow = stepFunctions.getWorkflow("UserDeployEC2Workflow");
        if (!deployWorkflow) {
            throw new Error("UserDeployEC2Workflow not found");
        }

        // Grant step functions permissions to unified API Lambda
        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["states:StartExecution"],
                resources: [terminateWorkflow.stateMachineArn, deployWorkflow.stateMachineArn],
            }),
        );

        // Grant permissions to check step function execution status
        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["states:DescribeExecution", "states:GetExecutionHistory"],
                resources: [
                    `arn:aws:states:${this.region}:${this.account}:execution:${terminateWorkflow.stateMachineName}:*`,
                    `arn:aws:states:${this.region}:${this.account}:execution:${deployWorkflow.stateMachineName}:*`,
                ],
            }),
        );

        // Add Step Function ARNs as environment variables to unified API Lambda
        lambdaFunctions.apiFunction.addEnvironment(
            "TERMINATE_WORKFLOW_ARN",
            terminateWorkflow.stateMachineArn,
        );
        lambdaFunctions.apiFunction.addEnvironment(
            "USER_DEPLOY_EC2_WORKFLOW_ARN",
            deployWorkflow.stateMachineArn,
        );

        // Grant EC2 termination permissions to terminateEC2Function
        lambdaFunctions.terminateEC2Function.addToRolePolicy(
            new PolicyStatement({
                actions: ["ec2:TerminateInstances", "ec2:DescribeInstances"],
                resources: ["*"],
            }),
        );

        this.apiFunction = lambdaFunctions.apiFunction;
    }
}
