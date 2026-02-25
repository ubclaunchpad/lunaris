import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "getDcvConfigFunction",
    constructId: "GetDcvConfigHandler",
    handler: "handlers/user-deploy-ec2/get-dcv-config.handler",
    description: "Retrieves DCV configuration from RunningStreams table",
    envVars: ["RUNNING_STREAMS_TABLE_NAME"],
};

export default config;
