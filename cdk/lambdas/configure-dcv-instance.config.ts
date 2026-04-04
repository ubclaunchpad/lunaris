import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "configureDcvInstanceFunction",
    constructId: "ConfigureDcvInstanceHandler",
    handler: "handlers/user-deploy-ec2/configure-dcv-instance.handler",
    description: "Configures DCV instance with SSL certificate and settings via SSM",
    timeoutSeconds: 300, // SSL setup can take a few minutes
    envVars: ["RUNNING_INSTANCES_TABLE_NAME"],
    policies: ["configureDcv"],
};

export default config;
