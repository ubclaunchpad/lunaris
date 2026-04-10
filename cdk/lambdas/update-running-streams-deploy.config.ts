import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "updateRunningStreamsFunction",
    constructId: "UpdateRunningStreamsHandler",
    handler: "handlers/user-deploy-ec2/update-running-streams.handler",
    description: "Updates running streams table with new session information",
    envVars: ["RUNNING_STREAMS_TABLE_NAME", "RUNNING_INSTANCES_TABLE_NAME"],
};

export default config;
