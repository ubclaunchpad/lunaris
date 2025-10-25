import { Construct } from "constructs";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";

export interface LambdaFunctionsProps {
  runningInstancesTable: Table;
}

export class LambdaFunctions extends Construct {
  public readonly deployInstanceFunction: Function;
  public readonly greetingHandler: Function;
  public readonly responseHandler: Function;
  public readonly terminateInstanceFunction: Function;
  public readonly streamingLinkFunction: Function;

  // lambda functions for UserDeployEC2 step function
  public readonly checkRunningStreamsFunction: Function;
  public readonly deployEC2Function: Function;
  public readonly updateRunningStreamsFunction: Function;

//   constructor(scope: Construct, id: string) {
  constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
    super(scope, id);



    this.deployInstanceFunction = new Function(this, "DeployInstanceHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../lambda/dist"),
      handler: "handlers/deployInstance.handler",
      timeout: Duration.seconds(60),
      environment: {
        RUNNING_INSTANCES_TABLE: props.runningInstancesTable.tableName
      }
    });

    // Step Function Lambda handlers - using placeholder functions for now
    this.greetingHandler = new Function(this, "GreetingHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../lambda/dist"),
      handler: "handlers/deployInstance.handler", // Using existing handler as placeholder
    });

    this.responseHandler = new Function(this, "ResponseHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../lambda/dist"),
      handler: "handlers/deployInstance.handler", // Using existing handler as placeholder
    });

    // Terminate Instance Lambda
    this.terminateInstanceFunction = new Function(
      this,
      "TerminateInstanceHandler",
      {
        runtime: Runtime.NODEJS_22_X,
        code: Code.fromAsset("../lambda/dist"),
        handler: "handlers/terminateInstance.handler",
      }
    );

    // Streaming Link Lambda
    this.streamingLinkFunction = new Function(this, "StreamingLinkFunction", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../lambda/dist"),
      handler: "handlers/streamingLink.handler",
    });

    // UserDeployEC2 step function lambdas
    this.checkRunningStreamsFunction = new Function(
      this,
      "CheckRunningStreamsHandler",
      {
        runtime: Runtime.NODEJS_22_X,
        code: Code.fromAsset("../lambda/dist"),
        handler: "handlers/user-deploy-ec2/check-running-streams.handler",
        environment: {
          RUNNING_STREAMS_TABLE_NAME: "RunningStreams",
        },
      }
    );

    this.deployEC2Function = new Function(this, "DeployEC2Handler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../lambda/dist"),
      handler: "handlers/user-deploy-ec2/deploy-ec2.handler",
    });

    this.updateRunningStreamsFunction = new Function(
      this,
      "UpdateRunningStreamsHandler",
      {
        runtime: Runtime.NODEJS_22_X,
        code: Code.fromAsset("../lambda/dist"),
        handler: "handlers/user-deploy-ec2/update-running-streams.handler",
        environment: {
          RUNNING_STREAMS_TABLE_NAME: "RunningStreams",
        },
      }
    );
  }
}
