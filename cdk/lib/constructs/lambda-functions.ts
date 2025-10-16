import { Construct } from "constructs";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";

export class LambdaFunctions extends Construct {
  public readonly helloFunction: Function;
  public readonly greetingHandler: Function;
  public readonly responseHandler: Function;
  
  public readonly checkRunningStreams: Function;
  public readonly terminateEC2: Function;
  public readonly updateRunningStreams: Function;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // API Gateway Lambda
    this.helloFunction = new Function(this, "HelloHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("lambda"),
      handler: "hello.handler",
    });

    // Step Function Lambda handlers
    this.greetingHandler = new Function(this, "GreetingHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("stepfunctions/example-workflow/lambdas"),
      handler: "greeting-handler.handler",
    });

    this.responseHandler = new Function(this, "ResponseHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("stepfunctions/example-workflow/lambdas"),
      handler: "response-handler.handler",
    });

    // UserTerminateEC2 Step Function Lambdas
    this.checkRunningStreams = new Function(this, "CheckRunningStreams", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("stepfunctions/user-terminate-ec2/lambdas"),
      handler: "response-handler.handler",
      environment: {
        RUNNING_STREAMS_TABLE_NAME: "RunningStreams", // TODO: update to the actual table name
      }
    })

    this.terminateEC2 = new Function(this, "TerminateEC2", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("stepfunctions/user-terminate-ec2/lambdas"),
      handler: "terminate-ec2.handler",
    })

    this.updateRunningStreams = new Function(this, "UpdateRunningStreams", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("stepfunctions/user-terminate-ec2/lambdas"),
      handler: "update-running-streams.handler",
      environment: {
        RUNNING_STREAMS_TABLE_NAME: "RunningStreams", // TODO: update to the actual table name
      }
    })
  }
}