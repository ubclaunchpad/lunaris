import { Construct } from "constructs";
import { Function } from "aws-cdk-lib/aws-lambda";
import { type ITable } from "aws-cdk-lib/aws-dynamodb";
import { LambdaRegistry } from "./lambda-registry";
import { LambdaFactory } from "./lambda-factory";
import { LambdaEnvVarProvider } from "./lambda-types";

export interface LambdaFunctionsProps {
    readonly runningInstancesTable: ITable;
    readonly runningStreamsTable: ITable;
    readonly ec2InstanceProfileArn?: string;
    readonly ec2InstanceProfileName?: string;
    readonly dcvSecurityGroupId?: string;
    readonly stripeSecretKey?: string;
    readonly stripePriceStarter?: string;
    readonly stripePriceBasic?: string;
    readonly stripePriceStandard?: string;
    readonly stripePricePremium?: string;
    readonly stripePricePro?: string;
}

export class LambdaFunctions extends Construct {
    /** All created Lambda functions, keyed by functionName from their config */
    public readonly functions: Map<string, Function>;
    /** Retained as a named reference for cross-stack use in ApiStack */
    public readonly apiFunction: Function;

    constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
        super(scope, id);

        const factory = new LambdaFactory(this);
        const provider = this.buildEnvVarProvider(props);

        this.functions = new Map();
        for (const config of LambdaRegistry.getAllLambdas()) {
            const fn = factory.createFunction(config, provider);
            this.functions.set(config.functionName, fn);
        }

        this.apiFunction = this.getFunction("apiFunction");
    }

    /**
     * Retrieve a Lambda function by its functionName.
     * @throws Error if no function with that name was created
     */
    public getFunction(name: string): Function {
        const fn = this.functions.get(name);
        if (!fn) {
            throw new Error(
                `Lambda function '${name}' not found — ensure a config exists in cdk/lambdas/`,
            );
        }
        return fn;
    }

    private buildEnvVarProvider(props: LambdaFunctionsProps): LambdaEnvVarProvider {
        return {
            RUNNING_INSTANCES_TABLE_NAME: props.runningInstancesTable.tableName,
            RUNNING_STREAMS_TABLE_NAME: props.runningStreamsTable.tableName,
            EC2_INSTANCE_PROFILE_ARN: props.ec2InstanceProfileArn ?? "",
            EC2_INSTANCE_PROFILE_NAME: props.ec2InstanceProfileName ?? "",
            SECURITY_GROUP_ID: props.dcvSecurityGroupId ?? "",
            LAMBDA_REGION: process.env.AWS_REGION ?? "us-west-2",
            STRIPE_SECRET_KEY: props.stripeSecretKey,
            STRIPE_PRICE_ID_STARTER: props.stripePriceStarter,
            STRIPE_PRICE_ID_BASIC: props.stripePriceBasic,
            STRIPE_PRICE_ID_STANDARD: props.stripePriceStandard,
            STRIPE_PRICE_ID_PREMIUM: props.stripePricePremium,
            STRIPE_PRICE_ID_PRO: props.stripePricePro,
        };
    }
}
