import { Construct } from "constructs";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export class LambdaFunctions extends Construct {
  public readonly helloFunction: Function;
  public readonly greetingHandler: Function;
  public readonly responseHandler: Function;

  // lambda functions for UserDeployEC2 step function
  public readonly checkUserExists: Function;
  public readonly deployEc2: Function;
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

    // UserDeployEC2 step function lambdas
    this.checkUserExists = new NodejsFunction(this, "CheckUserExists", {
      runtime: Runtime.NODEJS_22_X,
      entry: "stepfunctions/user-deploy-ec2/lambdas/check-user-exists.ts",
      environment: {
        RUNNING_STREAMS_TABLE_NAME: "RunningStreams",
      },
    });

    this.deployEc2 = new NodejsFunction(this, "DeployEc2", {
      runtime: Runtime.NODEJS_22_X,
      entry: "stepfunctions/user-deploy-ec2/lambdas/deploy-ec2.ts",
    });

    this.updateRunningStreams = new NodejsFunction(
      this,
      "UpdateRunningStreams",
      {
        runtime: Runtime.NODEJS_22_X,
        entry:
          "stepfunctions/user-deploy-ec2/lambdas/update-running-streams.ts",
        environment: {
          RUNNING_STREAMS_TABLE_NAME: "RunningStreams",
        },
      }
    );
  }
}
