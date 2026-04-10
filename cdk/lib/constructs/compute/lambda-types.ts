export type LambdaPolicy =
    | "deployEC2"
    | "resumeEC2"
    | "startDcv"
    | "configureDcv"
    | "terminateEC2"
    | "stopEC2"
    | "stopDcv"
    | "lunarisMetrics";

/**
 * Provider for CDK token values and static config needed to populate Lambda env vars.
 * Keys match the exact env var names set in the Lambda environment.
 */
export interface LambdaEnvVarProvider {
    readonly RUNNING_INSTANCES_TABLE_NAME: string;
    readonly RUNNING_STREAMS_TABLE_NAME: string;
    readonly GAMES_TABLE_NAME: string;
    readonly BASE_EBS_SNAPSHOT_ID?: string;
    readonly EC2_INSTANCE_PROFILE_ARN: string;
    readonly EC2_INSTANCE_PROFILE_NAME: string;
    readonly SECURITY_GROUP_ID: string;
    readonly SUBNET_ID?: string;
    readonly KEY_PAIR_NAME?: string;
    readonly LAMBDA_REGION: string;
    readonly FRONTEND_URL?: string;
    readonly STRIPE_SECRET_KEY?: string;
    readonly STRIPE_PRICE_ID_STARTER?: string;
    readonly STRIPE_PRICE_ID_BASIC?: string;
    readonly STRIPE_PRICE_ID_STANDARD?: string;
    readonly STRIPE_PRICE_ID_PREMIUM?: string;
    readonly STRIPE_PRICE_ID_PRO?: string;
    readonly USER_PAYMENTS_TABLE_NAME?: string;
    readonly USER_BALANCES_TABLE_NAME?: string;
    readonly STRIPE_WH_SECRET?: string;
}

/**
 * Configuration for a single Lambda function.
 * Defined in cdk/lambdas/ and discovered at synthesis time by LambdaRegistry.
 */
export interface LambdaFunctionConfig {
    /** Key used to reference this function — must match functionName in workflow.config.ts */
    readonly functionName: string;
    /** CDK construct ID — controls CloudFormation logical ID, preserve across refactors */
    readonly constructId: string;
    /** Lambda handler path, e.g. "handlers/api.handler" */
    readonly handler: string;
    readonly description: string;
    readonly timeoutSeconds?: number;
    readonly memorySize?: number;
    /** Env var keys from LambdaEnvVarProvider this function needs. Undefined values are omitted. */
    readonly envVars?: (keyof LambdaEnvVarProvider)[];
    /** Named IAM policy bundles to attach to this function's role */
    readonly policies?: LambdaPolicy[];
}
