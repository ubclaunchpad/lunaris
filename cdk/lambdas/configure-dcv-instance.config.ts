import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "configureDcvInstanceFunction",
    constructId: "ConfigureDcvInstanceHandler",
    handler: "handlers/user-deploy-ec2/configure-dcv-instance.handler",
    description: "Configures password and trusted DCV TLS on a booted instance via SSM",
    timeoutSeconds: 660,
    envVars: ["LAMBDA_REGION"],
    policies: ["configureDcv"],
};

export default config;
