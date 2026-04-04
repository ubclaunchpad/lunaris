import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "terminateEC2Function",
    constructId: "TerminateEC2Handler",
    handler: "handlers/user-terminate-ec2/terminate-ec2.handler",
    description: "Terminates EC2 instance as part of user termination workflow",
    timeoutSeconds: 60,
    envVars: ["RUNNING_INSTANCES_TABLE_NAME"],
    policies: ["terminateEC2", "lunarisMetrics"],
};

export default config;
