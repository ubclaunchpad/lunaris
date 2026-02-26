import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "updateRunningInstancesFunction",
    constructId: "UpdateRunningInstancesHandler",
    handler: "handlers/user-deploy-ec2/update-running-instances.handler",
    description: "Updates running instances table with new session information",
    envVars: ["RUNNING_INSTANCES_TABLE_NAME", "LAMBDA_REGION"],
};

export default config;
