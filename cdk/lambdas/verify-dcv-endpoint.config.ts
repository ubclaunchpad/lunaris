import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "verifyDcvEndpointFunction",
    constructId: "VerifyDcvEndpointHandler",
    handler: "handlers/user-deploy-ec2/verify-dcv-endpoint.handler",
    description: "Verifies that the public DCV endpoint is reachable with trusted TLS",
    timeoutSeconds: 420,
    envVars: ["LAMBDA_REGION"],
    policies: ["verifyDcv"],
};

export default config;
