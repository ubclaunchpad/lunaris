import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "checkRunningStreamsTerminateFunction",
    constructId: "CheckRunningStreamsTerminateHandler",
    handler: "handlers/user-terminate-ec2/check-running-streams.handler",
    description: "Checks if user has active streaming sessions for termination",
    envVars: ["RUNNING_STREAMS_TABLE_NAME"],
};

export default config;
