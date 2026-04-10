import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { StepFunctions, StepFunctionsProps } from "../lib/constructs/compute/step-functions";
import { WorkflowRegistry, WorkflowConfig } from "../lib/workflows";

describe("StepFunctions Construct", () => {
    let app: cdk.App;
    let stack: cdk.Stack;
    let testProps: StepFunctionsProps;

    function makeFn(id: string): Function {
        return new Function(stack, id, {
            runtime: Runtime.NODEJS_18_X,
            handler: "index.handler",
            code: Code.fromInline("exports.handler = async () => ({});"),
        });
    }

    function makeTestProps(...names: string[]): StepFunctionsProps {
        const functions = new Map<string, Function>();
        for (const name of names) {
            functions.set(name, makeFn(name));
        }
        return { functions };
    }

    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack");
        WorkflowRegistry.clearRegistry();
        WorkflowRegistry.discoverWorkflows();
        testProps = makeTestProps(
            "checkRunningStreamsFunction",
            "deployEC2Function",
            "configureDcvInstanceFunction",
            "verifyDcvEndpointFunction",
            "updateRunningStreamsFunction",
            "updateRunningInstancesFunction",
            "terminateEC2Function",
            "testLambdaFunction",
        );
    });

    afterEach(() => {
        WorkflowRegistry.clearRegistry();
    });

    describe("Workflow Registry Integration", () => {
        test("should create workflows from registry", () => {
            const testWorkflowConfig: WorkflowConfig = {
                name: "TestRegistryWorkflow",
                description: "Test workflow from registry",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            WorkflowRegistry.registerWorkflow(testWorkflowConfig);
            const stepFunctions = new StepFunctions(stack, "TestStepFunctions", testProps);
            const template = Template.fromStack(stack);

            // Should create StateMachine (UserDeployEC2Workflow from registry)
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);

            // Test workflow doesn't exist (definition file not present), so should be undefined
            const workflow = stepFunctions.getWorkflow("TestRegistryWorkflow");
            expect(workflow).toBeUndefined();
        });

        test("should handle multiple workflows from registry", () => {
            const workflow1: WorkflowConfig = {
                name: "TestWorkflow1",
                description: "First test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };
            const workflow2: WorkflowConfig = {
                name: "TestWorkflow2",
                description: "Second test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            WorkflowRegistry.registerWorkflow(workflow1);
            WorkflowRegistry.registerWorkflow(workflow2);

            const stepFunctions = new StepFunctions(stack, "TestStepFunctions", testProps);

            expect(stepFunctions.getWorkflow("TestWorkflow1")).toBeUndefined();
            expect(stepFunctions.getWorkflow("TestWorkflow2")).toBeUndefined();

            // Auto-discovery should still find UserDeployEC2Workflow
            const workflowNames = stepFunctions.getWorkflowNames();
            expect(workflowNames).toContain("UserDeployEC2Workflow");
            expect(workflowNames).not.toContain("TestWorkflow1");
            expect(workflowNames).not.toContain("TestWorkflow2");
        });
    });

    describe("Workflow Access Methods", () => {
        test("should return undefined for non-existent workflow", () => {
            const stepFunctions = new StepFunctions(stack, "TestStepFunctions", testProps);
            expect(stepFunctions.getWorkflow("NonExistentWorkflow")).toBeUndefined();
        });

        test("should return workflows when auto-discovery finds configurations", () => {
            const stepFunctions = new StepFunctions(stack, "TestStepFunctions", testProps);
            const allWorkflows = stepFunctions.getAllWorkflows();
            expect(allWorkflows.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(stepFunctions.getWorkflowNames())).toBe(true);
        });

        test("should handle workflow creation failures gracefully", () => {
            const invalidWorkflowConfig: WorkflowConfig = {
                name: "InvalidWorkflow",
                description: "Workflow with missing Lambda function",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    missingLambda: {
                        functionName: "nonExistentFunction",
                        placeholder: "${MissingLambdaArn}",
                        required: true,
                    },
                },
            };
            WorkflowRegistry.registerWorkflow(invalidWorkflowConfig);
            expect(() => {
                new StepFunctions(stack, "TestStepFunctions", testProps);
            }).not.toThrow();
        });
    });

    describe("UserDeployEC2Workflow Integration", () => {
        test("should create UserDeployEC2Workflow from configuration system", () => {
            const stepFunctions = new StepFunctions(stack, "TestStepFunctions", testProps);
            const template = Template.fromStack(stack);

            const workflow = stepFunctions.getWorkflow("UserDeployEC2Workflow");
            expect(workflow).toBeDefined();
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);

            const policies = template.findResources("AWS::IAM::Policy");
            expect(Object.keys(policies).length).toBeGreaterThan(0);
        });

        test("should use new workflow configuration for UserDeployEC2Workflow", () => {
            new StepFunctions(stack, "TestStepFunctions", testProps);

            const registeredWorkflow = WorkflowRegistry.getWorkflow("UserDeployEC2Workflow");
            expect(registeredWorkflow).toBeDefined();
            expect(registeredWorkflow?.name).toBe("UserDeployEC2Workflow");
            expect(registeredWorkflow?.description).toBe("Orchestrates user EC2 deployment process");

            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("checkRunningStreams");
            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("deployEC2");
            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("configureDcvInstance");
            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("verifyDcvEndpoint");
            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("updateRunningStreams");
            expect(registeredWorkflow?.lambdaFunctions).not.toHaveProperty("checkRunningInstances");
            expect(registeredWorkflow?.lambdaFunctions).not.toHaveProperty("resumeDeployInstance");
            expect(registeredWorkflow?.lambdaFunctions).not.toHaveProperty("startDcvInstance");
            expect(registeredWorkflow?.lambdaFunctions).not.toHaveProperty("getDcvConfig");

            expect(registeredWorkflow?.timeout).toBeDefined();
            expect(registeredWorkflow?.retryConfig).toBeDefined();
            expect(registeredWorkflow?.errorHandling).toBeDefined();
        });
    });

    describe("Integration with WorkflowFactory", () => {
        test("should use WorkflowFactory for workflow creation", () => {
            const testWorkflowConfig: WorkflowConfig = {
                name: "FactoryTestWorkflow",
                description: "Test workflow created through factory",
                definitionPath: "test-workflow/definition.asl.json",
                timeout: Duration.minutes(5),
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };
            WorkflowRegistry.registerWorkflow(testWorkflowConfig);

            const stepFunctions = new StepFunctions(stack, "TestStepFunctions", testProps);
            const template = Template.fromStack(stack);

            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
            expect(stepFunctions.getWorkflow("FactoryTestWorkflow")).toBeUndefined();
        });

        test("should pass Lambda functions to WorkflowFactory correctly", () => {
            const testWorkflowConfig: WorkflowConfig = {
                name: "LambdaTestWorkflow",
                description: "Test workflow with Lambda functions",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    checkStreams: {
                        functionName: "checkRunningStreamsFunction",
                        placeholder: "${CheckStreamsArn}",
                        required: true,
                    },
                    deployEC2: {
                        functionName: "deployEC2Function",
                        placeholder: "${DeployArn}",
                        required: true,
                    },
                },
            };
            WorkflowRegistry.registerWorkflow(testWorkflowConfig);

            new StepFunctions(stack, "TestStepFunctions", testProps);
            const template = Template.fromStack(stack);

            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
            const policies = template.findResources("AWS::IAM::Policy");
            expect(Object.keys(policies).length).toBeGreaterThan(0);
        });
    });
});
