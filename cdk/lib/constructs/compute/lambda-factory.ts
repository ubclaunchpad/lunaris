import { Construct } from "constructs";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { LambdaFunctionConfig, LambdaEnvVarProvider, LambdaPolicy } from "./lambda-types";
import {
    getDeployEC2Policies,
    getConfigureDcvInstancePolicies,
    getTerminateEC2Policies,
} from "../iam/lambda-policies";

/**
 * Creates Lambda CDK resources from LambdaFunctionConfig.
 * Handles env var resolution from the provider and IAM policy attachment.
 */
export class LambdaFactory {
    private readonly scope: Construct;

    constructor(scope: Construct) {
        this.scope = scope;
    }

    public createFunction(
        config: LambdaFunctionConfig,
        provider: LambdaEnvVarProvider,
    ): Function {
        const fn = new Function(this.scope, config.constructId, {
            runtime: Runtime.NODEJS_22_X,
            code: Code.fromAsset("../lambda/dist"),
            handler: config.handler,
            description: config.description,
            timeout: Duration.seconds(config.timeoutSeconds ?? 30),
            memorySize: config.memorySize ?? 256,
            environment: this.resolveEnvVars(config.envVars, provider),
        });

        this.attachPolicies(fn, config.policies);

        return fn;
    }

    private resolveEnvVars(
        keys: (keyof LambdaEnvVarProvider)[] | undefined,
        provider: LambdaEnvVarProvider,
    ): Record<string, string> {
        const environment: Record<string, string> = {};
        for (const key of keys ?? []) {
            const value = provider[key];
            if (value !== undefined) {
                environment[key as string] = value;
            }
        }
        return environment;
    }

    private attachPolicies(fn: Function, policies: LambdaPolicy[] | undefined): void {
        for (const policy of policies ?? []) {
            for (const statement of this.getPolicyStatements(policy)) {
                fn.addToRolePolicy(statement);
            }
        }
    }

    private getPolicyStatements(policy: LambdaPolicy) {
        switch (policy) {
            case "deployEC2":
                return getDeployEC2Policies();
            case "configureDcv":
                return getConfigureDcvInstancePolicies();
            case "terminateEC2":
                return getTerminateEC2Policies();
        }
    }
}
