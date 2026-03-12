import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "apiFunction",
    constructId: "LunarisApiHandler",
    handler: "handlers/api.handler",
    description: "Unified API handler for all Lunaris API endpoints",
    timeoutSeconds: 60,
    envVars: ["RUNNING_INSTANCES_TABLE_NAME", "RUNNING_STREAMS_TABLE_NAME","GAMES_TABLE_NAME", "STRIPE_SECRET_KEY"],
};

export default config;
