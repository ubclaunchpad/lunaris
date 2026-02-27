import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "stopDcvInstanceFunction",
    constructId: "StopDcvInstanceHandler",
    handler: "handlers/user-terminate-ec2/stop-dcv-instance.handler",
    description: "Stops DCV instance",
    envVars: ["RUNNING_INSTANCES_TABLE_NAME"],
    policies: ["stopDcv"],
};

export default config;
