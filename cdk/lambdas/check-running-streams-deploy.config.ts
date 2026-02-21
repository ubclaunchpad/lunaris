import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "checkRunningStreamsFunction",
    constructId: "CheckRunningStreamsHandler",
    handler: "handlers/user-deploy-ec2/check-running-streams.handler",
    description: "Checks if user has active streaming sessions",
    envVars: ["RUNNING_STREAMS_TABLE_NAME"],
};

export default config;
