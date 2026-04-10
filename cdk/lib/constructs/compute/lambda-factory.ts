import * as path from "path";
import { Construct } from "constructs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Duration } from "aws-cdk-lib";
import { LambdaFunctionConfig, LambdaEnvVarProvider, LambdaPolicy } from "./lambda-types";
import {
    getDeployEC2Policies,
    getVerifyDcvEndpointPolicies,
    getTerminateEC2Policies,
    getStopEC2Policies,
    getStopDCVInstancePolicies,
    getLunarisCustomMetricsPolicies,
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
    ): NodejsFunction {
        const { entry, handler } = this.resolveEntryAndHandler(config.handler);

        const fn = new NodejsFunction(this.scope, config.constructId, {
            runtime: Runtime.NODEJS_22_X,
            entry,
            handler,
            description: config.description,
            timeout: Duration.seconds(config.timeoutSeconds ?? 30),
            memorySize: config.memorySize ?? 256,
            environment: this.resolveEnvVars(config.envVars, provider),
            bundling: {
                externalModules: ["@aws-sdk/*"],
                target: "node22",
                sourceMap: true,
                minify: false,
            },
        });

        this.attachPolicies(fn, config.policies);

        return fn;
    }

    private resolveEntryAndHandler(lambdaHandler: string): { entry: string; handler: string } {
        const [modulePath, handler] = lambdaHandler.split(".");
        if (!modulePath || !handler) {
            throw new Error(
                `Invalid handler format '${lambdaHandler}'. Expected '<path>.<export>'`,
            );
        }

        // cdk commands are executed from root cdk folder, so lambda functions are relatively located within ../lambda/src.
        const entry = path.resolve(process.cwd(), "../lambda/src", `${modulePath}.ts`);
        return { entry, handler };
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

    private attachPolicies(fn: NodejsFunction, policies: LambdaPolicy[] | undefined): void {
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
            case "verifyDcv":
                return getVerifyDcvEndpointPolicies();
            case "terminateEC2":
                return getTerminateEC2Policies();
            case "stopEC2":
                return getStopEC2Policies();
            case "stopDcv":
                return getStopDCVInstancePolicies();
            case "lunarisMetrics":
                return getLunarisCustomMetricsPolicies();
        }
    }
}
