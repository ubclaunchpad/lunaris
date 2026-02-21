import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "updateRunningStreamsTerminateFunction",
    constructId: "UpdateRunningStreamsTerminateHandler",
    handler: "handlers/user-terminate-ec2/update-running-streams.handler",
    description: "Updates running streams table to mark session as terminated",
    envVars: ["RUNNING_STREAMS_TABLE_NAME"],
};

export default config;
