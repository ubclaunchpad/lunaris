import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "checkRunningInstancesFunction",
    constructId: "CheckRunningInstancesHandler",
    handler: "handlers/user-deploy-ec2/check-running-instances.handler",
    description: "Checks if user has active streaming sessions",
    envVars: ["RUNNING_INSTANCES_TABLE_NAME"],
};

export default config;
