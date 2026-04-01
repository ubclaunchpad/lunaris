import { LambdaFunctionConfig } from "../lib/constructs/compute/lambda-types";

const config: LambdaFunctionConfig = {
    functionName: "publishActiveInstancesMetricFunction",
    constructId: "PublishActiveInstancesMetricHandler",
    handler: "handlers/observability/publish-active-instances-metric.handler",
    description: "Publishes current active EC2 instance count to CloudWatch",
    envVars: ["RUNNING_INSTANCES_TABLE_NAME", "LAMBDA_REGION"],
    policies: ["lunarisMetrics"],
};

export default config;
