import { Construct } from "constructs";
import {
  RestApi,
  LambdaIntegration,
  StepFunctionsIntegration,
  JsonSchemaType,
  Model,
  RequestValidator,
} from "aws-cdk-lib/aws-apigateway";
import { Function } from "aws-cdk-lib/aws-lambda";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";

export interface ApiGatewayProps {
  userDeployEC2Workflow: StateMachine;
  terminateInstanceFunction: Function;
  streamingLinkFunction: Function;
}

export class ApiGateway extends Construct {
  public readonly restApi: RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    this.restApi = new RestApi(this, "LunarisApi", {
      description: "LunarisAPI",
      restApiName: "LunarisAPI",
    });

    // Add API endpoints to LunarisApi here
    this.createDeployInstanceEndpoint(props.userDeployEC2Workflow);
    this.createTerminateInstanceEndpoint(props.terminateInstanceFunction);
    this.createStreamingLinkEndpoint(props.streamingLinkFunction);
  }

  private createDeployInstanceEndpoint(stateMachine: StateMachine): void {
    const resource = this.restApi.root.addResource("deployInstance");

    const requestModel = new Model(this, "DeployInstanceRequestModel", {
      restApi: this.restApi,
      contentType: "application/json",
      modelName: "DeployInstanceRequest",
      schema: {
        type: JsonSchemaType.OBJECT,
        required: ["userId", "amiId"],
        properties: {
          userId: {
            type: JsonSchemaType.STRING,
            description: "User ID for the deployment",
          },
          instanceType: {
            type: JsonSchemaType.STRING,
            description: "EC2 instance type (optional, defaults to t3.micro)",
          },
          amiId: {
            type: JsonSchemaType.STRING,
            description: "AMI ID for the EC2 instance",
          },
        },
      },
    });

    const requestValidator = new RequestValidator(this, "DeployInstanceRequestValidator", {
      restApi: this.restApi,
      requestValidatorName: "DeployInstanceRequestValidator",
      validateRequestBody: true,
      validateRequestParameters: false,
    });

    const integration = StepFunctionsIntegration.startExecution(stateMachine, {
      requestTemplates: {
        "application/json": `{
          "input": "$util.escapeJavaScript($input.json('$'))"
        }`,
      },
      integrationResponses: [
        {
          statusCode: "200",
          responseTemplates: {
            "application/json": `{
              "status": "success",
              "message": "Deployment workflow started successfully",
              "statusCode": 200
            }`,
          },
        },
        {
          statusCode: "400",
          selectionPattern: "4\\d{2}",
          responseTemplates: {
            "application/json": `{
              "message": "Bad Request",
              "statusCode": 400
            }`,
          },
        },
        {
          statusCode: "500",
          selectionPattern: "5\\d{2}",
          responseTemplates: {
            "application/json": `{
              "message": "Internal Server Error",
              "statusCode": 500
            }`,
          },
        },
      ],
    });

    resource.addMethod("POST", integration, {
      requestModels: {
        "application/json": requestModel,
      },
      requestValidator: requestValidator,
      methodResponses: [
        {
          statusCode: "200",
          responseModels: {
            "application/json": { modelId: "Empty" },
          },
        },
        {
          statusCode: "400",
          responseModels: {
            "application/json": { modelId: "Error" },
          },
        },
        {
          statusCode: "500",
          responseModels: {
            "application/json": { modelId: "Error" },
          },
        },
      ],
    });
  }

  private createTerminateInstanceEndpoint(lambdaFunction: Function): void {
    const integration = new LambdaIntegration(lambdaFunction);
    const resource = this.restApi.root.addResource("terminateInstance");

    resource.addMethod("POST", integration, {
      methodResponses: [
        {
          statusCode: "200",
          responseModels: {
            "application/json": { modelId: "Empty" },
          },
        },
        {
          statusCode: "400",
          responseModels: {
            "application/json": { modelId: "Error" },
          },
        },
      ],
    });
  }

  private createStreamingLinkEndpoint(lambdaFunction: Function): void {
    const integration = new LambdaIntegration(lambdaFunction);
    const resource = this.restApi.root.addResource("streamingLink");

    resource.addMethod("GET", integration, {
      requestParameters: {
        "method.request.querystring.userId": true,
      },
      methodResponses: [
        {
          statusCode: "200",
          responseModels: {
            "application/json": { modelId: "Empty" },
          },
        },
        {
          statusCode: "400",
          responseModels: {
            "application/json": { modelId: "Error" },
          },
        },
        {
          statusCode: "404",
          responseModels: {
            "application/json": { modelId: "Error" },
          },
        },
      ],
    });
  }
}
