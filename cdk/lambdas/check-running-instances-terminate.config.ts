import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "checkRunningInstancesTerminateFunction",
    constructId: "CheckRunningInstancesTerminateHandler",
    handler: "handlers/user-terminate-ec2/check-running-instances.handler",
    description: "Checks if user has active instance for terminate workflow",
    envVars: ["RUNNING_INSTANCES_TABLE_NAME"],
};

export default config;
