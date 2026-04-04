import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "startDcvInstanceFunction",
    constructId: "StartDcvInstanceHandler",
    handler: "handlers/user-deploy-ec2/start-dcv-instance.handler",
    description: "Starts the DCV Windows service on a stopped EC2 instance",
    timeoutSeconds: 120,
    envVars: ["LAMBDA_REGION"],
    policies: ["startDcv"],
};

export default config;
