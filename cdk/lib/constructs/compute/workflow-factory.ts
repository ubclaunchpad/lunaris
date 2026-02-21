import { Construct } from "constructs";
import {
    StateMachine,
    DefinitionBody,
    type StateMachineProps,
} from "aws-cdk-lib/aws-stepfunctions";
import { Function } from "aws-cdk-lib/aws-lambda";
import type { WorkflowConfig, RetryConfig } from "../../workflows/types";
import * as fs from "fs";
import * as path from "path";

/**
 * Factory class for creating Step Functions workflows from configuration
 */
export class WorkflowFactory extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);
    }

    /**
     * Creates a Step Functions workflow from configuration
     * @param config The workflow configuration
     * @param lambdaFunctions Map of available Lambda functions keyed by functionName
     * @returns The created StateMachine
     */
    public createWorkflow(
        config: WorkflowConfig,
        lambdaFunctions: Map<string, Function>,
    ): StateMachine {
        this.validateConfig(config, lambdaFunctions);

        const definitionBody = this.processDefinition(config, lambdaFunctions);

        const stateMachineProps: StateMachineProps = {
            definitionBody: DefinitionBody.fromString(definitionBody),
            comment: config.description,
            timeout: config.timeout,
        };

        const stateMachine = new StateMachine(this, config.name, stateMachineProps);

        this.grantPermissions(config, lambdaFunctions, stateMachine);

        return stateMachine;
    }

    /**
     * Validates workflow configuration against available Lambda functions
     * @throws Error if validation fails
     */
    private validateConfig(config: WorkflowConfig, lambdaFunctions: Map<string, Function>): void {
        if (!config.name) {
            throw new Error("Workflow configuration must have a name");
        }

        if (!config.description) {
            throw new Error(`Workflow '${config.name}' must have a description`);
        }

        if (!config.definitionPath) {
            throw new Error(`Workflow '${config.name}' must have a definitionPath`);
        }

        const definitionPath = this.getDefinitionPath(config.definitionPath);
        if (!fs.existsSync(definitionPath)) {
            throw new Error(
                `Definition file not found for workflow '${config.name}' at path: ${definitionPath}`,
            );
        }

        Object.values(config.lambdaFunctions).forEach((ref) => {
            if (ref.required && !lambdaFunctions.get(ref.functionName)) {
                throw new Error(
                    `Required Lambda function '${ref.functionName}' not found for workflow '${config.name}'`,
                );
            }
        });

        if (config.retryConfig) {
            this.validateRetryConfig(config.name, config.retryConfig);
        }
    }

    /**
     * Validates retry configuration parameters
     * @throws Error if validation fails
     */
    private validateRetryConfig(workflowName: string, retryConfig: RetryConfig): void {
        if (retryConfig.maxAttempts <= 0) {
            throw new Error(
                `Workflow '${workflowName}' retry config maxAttempts must be greater than 0`,
            );
        }

        if (retryConfig.backoffRate <= 0) {
            throw new Error(
                `Workflow '${workflowName}' retry config backoffRate must be greater than 0`,
            );
        }

        if (retryConfig.intervalSeconds <= 0) {
            throw new Error(
                `Workflow '${workflowName}' retry config intervalSeconds must be greater than 0`,
            );
        }
    }

    /**
     * Processes the workflow definition by applying Lambda ARN substitutions
     */
    private processDefinition(
        config: WorkflowConfig,
        lambdaFunctions: Map<string, Function>,
    ): string {
        const definitionPath = this.getDefinitionPath(config.definitionPath);

        try {
            let template = fs.readFileSync(definitionPath, "utf8");

            try {
                JSON.parse(template);
            } catch (jsonError) {
                throw new Error(
                    `Invalid JSON in definition file for workflow '${config.name}': ${jsonError}`,
                );
            }

            Object.values(config.lambdaFunctions).forEach((ref) => {
                const lambdaFunction = lambdaFunctions.get(ref.functionName);
                if (lambdaFunction) {
                    template = template.replace(
                        new RegExp(this.escapeRegex(ref.placeholder), "g"),
                        lambdaFunction.functionArn,
                    );
                }
            });

            this.validatePlaceholderSubstitution(config, template);

            return template;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to process definition for workflow '${config.name}': ${error}`);
        }
    }

    /**
     * Validates that all required placeholders were substituted
     * @throws Error if required placeholders remain
     */
    private validatePlaceholderSubstitution(
        config: WorkflowConfig,
        processedTemplate: string,
    ): void {
        Object.values(config.lambdaFunctions).forEach((ref) => {
            if (ref.required && processedTemplate.includes(ref.placeholder)) {
                throw new Error(
                    `Required placeholder '${ref.placeholder}' was not substituted in workflow '${config.name}'. ` +
                        `Check that Lambda function '${ref.functionName}' is provided.`,
                );
            }
        });
    }

    /**
     * Grants invoke permissions from the state machine to each Lambda function
     */
    private grantPermissions(
        config: WorkflowConfig,
        lambdaFunctions: Map<string, Function>,
        stateMachine: StateMachine,
    ): void {
        Object.values(config.lambdaFunctions).forEach((ref) => {
            const lambdaFunction = lambdaFunctions.get(ref.functionName);
            if (lambdaFunction) {
                lambdaFunction.grantInvoke(stateMachine);
            }
        });
    }

    /**
     * Constructs the full path to a workflow definition file
     */
    private getDefinitionPath(relativePath: string): string {
        return path.join(__dirname, "../../../stepfunctions", relativePath);
    }

    /**
     * Escapes special regex characters in a string
     */
    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
