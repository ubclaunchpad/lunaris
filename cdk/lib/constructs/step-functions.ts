import { Construct } from "constructs";
import { StateMachine, DefinitionBody } from "aws-cdk-lib/aws-stepfunctions";
import { Function } from "aws-cdk-lib/aws-lambda";
import * as fs from "fs";
import * as path from "path";

export interface StepFunctionsProps {
  greetingHandler: Function;
  responseHandler: Function;
  checkRunningStreams: Function;
  terminateEC2: Function;
  updateRunningStreams: Function;
}

export class StepFunctions extends Construct {
  public readonly greetingWorkflow: StateMachine;
  public readonly userTerminateEC2Workflow: StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsProps) {
    super(scope, id);

    // Load and process the Step Function definition
    const definitionPath = path.join(__dirname, "../../stepfunctions/example-workflow/definition.asl.json");
    const definitionTemplate = fs.readFileSync(definitionPath, "utf8");
    
    // Replace placeholders with actual Lambda ARNs
    const definition = definitionTemplate
      .replace("${GreetingHandlerArn}", props.greetingHandler.functionArn)
      .replace("${ResponseHandlerArn}", props.responseHandler.functionArn);

    // Create the Step Function
    this.greetingWorkflow = new StateMachine(this, "GreetingWorkflow", {
      definitionBody: DefinitionBody.fromString(definition),
    });

    // Grant Step Function permission to invoke the Lambda functions
    props.greetingHandler.grantInvoke(this.greetingWorkflow);
    props.responseHandler.grantInvoke(this.greetingWorkflow);

    // Create the UserTerminateEC2 Step Function
    const userTerminateDefinitionPath = path.join(__dirname, "../../stepfunctions/user-terminate-ec2/definition.asl.json");
    const userTerminateDefinitionTemplate = fs.readFileSync(userTerminateDefinitionPath, "utf8");
    
    // Replace placeholders with actual Lambda ARNs
    const userTerminateDefinition = userTerminateDefinitionTemplate
      .replace("${CheckRunningStreamsArn}", props.checkRunningStreams.functionArn)
      .replace("${TerminateEC2Arn}", props.terminateEC2.functionArn)
      .replace("${UpdateRunningStreamsArn}", props.updateRunningStreams.functionArn);

    this.userTerminateEC2Workflow = new StateMachine(this, "UserTerminateEC2Workflow", {
      definitionBody: DefinitionBody.fromString(userTerminateDefinition),
    });

    // Grant Step Function permission to invoke the Lambda functions
    props.checkRunningStreams.grantInvoke(this.userTerminateEC2Workflow);
    props.terminateEC2.grantInvoke(this.userTerminateEC2Workflow);
    props.updateRunningStreams.grantInvoke(this.userTerminateEC2Workflow);
  }
}