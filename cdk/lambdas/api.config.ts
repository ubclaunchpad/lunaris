import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "apiFunction",
    constructId: "LunarisApiHandler",
    handler: "handlers/api.handler",
    description: "Unified API handler for all Lunaris API endpoints",
    timeoutSeconds: 60,
    envVars: [
        "RUNNING_INSTANCES_TABLE_NAME",
        "RUNNING_STREAMS_TABLE_NAME",
        "FRONTEND_URL",
        "STRIPE_SECRET_KEY",
        "STRIPE_PRICE_ID_STARTER",
        "STRIPE_PRICE_ID_BASIC",
        "STRIPE_PRICE_ID_STANDARD",
        "STRIPE_PRICE_ID_PREMIUM",
        "STRIPE_PRICE_ID_PRO",
    ],
};

export default config;
