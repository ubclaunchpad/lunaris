import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "resumeDeployInstanceFunction",
    constructId: "ResumeDeployInstanceHandler",
    handler: "handlers/user-deploy-ec2/resume-deploy-instance.ts",
    description:
        "Deploys instance when user already has a previously stopped but not terminated game instance as part of user deployment workflow",
    envVars: ["LAMBDA_REGION"],
    policies: ["resumeEC2"]
};

export default config;
