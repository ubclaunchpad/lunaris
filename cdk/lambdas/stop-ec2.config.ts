import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "stopEC2Function",
    constructId: "StopEC2Handler",
    handler: "handlers/user-terminate-ec2/stop-ec2.handler",
    description: "Stop EC2 instance as part of user termination workflow",
    timeoutSeconds: 60,
    envVars: ["RUNNING_INSTANCES_TABLE_NAME", "LAMBDA_REGION"],
    policies: ["stopEC2"],
};

export default config;
