import { Construct } from "constructs";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Function } from "aws-cdk-lib/aws-lambda";
import { WorkflowFactory } from "./workflow-factory";
import { WorkflowRegistry } from "../../workflows";

export interface StepFunctionsProps {
    readonly functions: Map<string, Function>;
}

export class StepFunctions extends Construct {
    private readonly workflows: Map<string, StateMachine> = new Map();
    private readonly workflowFactory: WorkflowFactory;

    constructor(scope: Construct, id: string, props: StepFunctionsProps) {
        super(scope, id);

        this.workflowFactory = new WorkflowFactory(this, "WorkflowFactory");
        this.createWorkflows(props.functions);
    }

    private createWorkflows(functions: Map<string, Function>): void {
        WorkflowRegistry.getAllWorkflows().forEach((config) => {
            try {
                const workflow = this.workflowFactory.createWorkflow(config, functions);
                this.workflows.set(config.name, workflow);
            } catch (error) {
                console.warn(`Failed to create workflow '${config.name}':`, error);
            }
        });
    }

    /**
     * Get a workflow by name
     * @returns The StateMachine instance or undefined if not found
     */
    public getWorkflow(name: string): StateMachine | undefined {
        return this.workflows.get(name);
    }

    /**
     * Get all created workflows
     */
    public getAllWorkflows(): StateMachine[] {
        return Array.from(this.workflows.values());
    }

    /**
     * Get all workflow names
     */
    public getWorkflowNames(): string[] {
        return Array.from(this.workflows.keys());
    }
}
