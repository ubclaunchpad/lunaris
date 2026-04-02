import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "deployEC2Function",
    constructId: "DeployEC2Handler",
    handler: "handlers/user-deploy-ec2/deploy-ec2.handler",
    description: "Deploys EC2 instance as part of user deployment workflow",
    envVars: [
        "LAMBDA_REGION",
        "EC2_INSTANCE_PROFILE_ARN",
        "EC2_INSTANCE_PROFILE_NAME",
        "SECURITY_GROUP_ID",
        "BASE_EBS_SNAPSHOT_ID",
    ],
    policies: ["deployEC2", "lunarisMetrics"],
};

export default config;
