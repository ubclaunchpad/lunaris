import { WorkflowConfig } from "../../lib/workflows";
import { Duration } from "aws-cdk-lib";

/**
 * Configuration for the UserDeployEC2 workflow
 *
 * This workflow orchestrates the EC2 deployment process for users by:
 * 1. Checking if there are any running streams for the user
 * 2. Deploying a new EC2 instance from a DCV-ready AMI
 * 3. Writing the DCV URL to DynamoDB
 */
const config: WorkflowConfig = {
    name: "UserDeployEC2Workflow",
    description: "Orchestrates user EC2 deployment process",
    definitionPath: "user-deploy-ec2/definition.asl.json",
    timeout: Duration.minutes(20),
    lambdaFunctions: {
        checkRunningStreams: {
            functionName: "checkRunningStreamsFunction",
            placeholder: "${CheckRunningStreamsArn}",
            required: true,
        },
        deployEC2: {
            functionName: "deployEC2Function",
            placeholder: "${DeployEC2Arn}",
            required: true,
        },
        updateRunningStreams: {
            functionName: "updateRunningStreamsFunction",
            placeholder: "${UpdateRunningStreamsArn}",
            required: true,
        },
        updateRunningInstances: {
            functionName: "updateRunningInstancesFunction",
            placeholder: "${UpdateRunningInstancesArn}",
            required: true,
        },
        terminateEC2: {
            functionName: "terminateEC2Function",
            placeholder: "${TerminateEC2Arn}",
            required: true,
        },
    },
    retryConfig: {
        maxAttempts: 3,
        backoffRate: 2.0,
        intervalSeconds: 2,
    },
    errorHandling: {
        catchAll: true,
        customErrorStates: {
            MissingTableNameEnv: "HandleMissingTableName",
            DatabaseError: "HandleDatabaseError",
            StreamsRunningError: "HandleStreamsRunningError",
            DeploymentFailedError: "HandleFailedDeployment",
            RollbackCompleteError: "HandleRollbackComplete",
        },
    },
};

export default config;
