import { Construct } from "constructs";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Function } from "aws-cdk-lib/aws-lambda";

export interface ApiGatewayProps {
  helloFunction: Function;
}

export class ApiGateway extends Construct {
  public readonly restApi: LambdaRestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    // API Gateway REST API resource backed by the hello function
    this.restApi = new LambdaRestApi(this, "Endpoint", {
      handler: props.helloFunction,
    });
  }
}