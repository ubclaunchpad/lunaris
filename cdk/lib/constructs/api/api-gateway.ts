import { Construct } from "constructs";
import {
    LambdaRestApi,
    LambdaIntegration,
    CognitoUserPoolsAuthorizer,
    AuthorizationType,
    Cors,
    MethodOptions,
} from "aws-cdk-lib/aws-apigateway";
import { Function } from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface ApiGatewayProps {
    apiFunction: Function;
    userPool?: cognito.UserPool;
}

interface EndpointDefinition {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    /** Status codes to include in methodResponses (401 is auto-added when authorizer is present) */
    statusCodes: string[];
    /** Query params declared as required (true) when no authorizer, optional (false) when authorizer is present */
    queryParams?: string[];
}

const ENDPOINTS: EndpointDefinition[] = [
    {
        path: "deployInstance",
        method: "POST",
        statusCodes: ["200", "400"],
    },
    {
        path: "terminateInstance",
        method: "POST",
        statusCodes: ["200", "400"],
    },
    {
        path: "streamingLink",
        method: "GET",
        statusCodes: ["200", "400", "404"],
        queryParams: ["method.request.querystring.userId"],
    },
    {
        path: "deployment-status",
        method: "GET",
        statusCodes: ["200", "400", "404"],
        queryParams: ["method.request.querystring.userId"],
    },
];

const RESPONSE_MODELS: Record<string, Record<string, { modelId: string }>> = {
    "200": { "application/json": { modelId: "Empty" } },
    "400": { "application/json": { modelId: "Error" } },
    "401": { "application/json": { modelId: "Error" } },
    "404": { "application/json": { modelId: "Error" } },
};

export class ApiGateway extends Construct {
    public readonly restApi: LambdaRestApi;
    public readonly authorizer?: CognitoUserPoolsAuthorizer;

    constructor(scope: Construct, id: string, props: ApiGatewayProps) {
        super(scope, id);

        this.restApi = new LambdaRestApi(this, "LunarisApi", {
            handler: props.apiFunction,
            proxy: false,
            description: "LunarisAPI",
            defaultCorsPreflightOptions: {
                allowOrigins: Cors.ALL_ORIGINS,
                allowMethods: Cors.ALL_METHODS,
                allowHeaders: [
                    "Content-Type",
                    "X-Amz-Date",
                    "Authorization",
                    "X-Api-Key",
                    "X-Amz-Security-Token",
                ],
                allowCredentials: true,
            },
        });

        if (props.userPool) {
            this.authorizer = new CognitoUserPoolsAuthorizer(this, "LunarisApiAuthorizer", {
                cognitoUserPools: [props.userPool],
                authorizerName: "LunarisAuthorizer",
                identitySource: "method.request.header.Authorization",
            });
        }

        const integration = new LambdaIntegration(props.apiFunction);
        for (const endpoint of ENDPOINTS) {
            this.addEndpoint(integration, endpoint);
        }
    }

    private addEndpoint(integration: LambdaIntegration, endpoint: EndpointDefinition): void {
        const resource = this.restApi.root.addResource(endpoint.path);

        const statusCodes = this.authorizer
            ? [...endpoint.statusCodes, "401"]
            : endpoint.statusCodes;

        // With authorizer, userId comes from the token so query params are optional
        const requestParameters = endpoint.queryParams?.length
            ? Object.fromEntries(endpoint.queryParams.map((param) => [param, !this.authorizer]))
            : undefined;

        const methodOptions: MethodOptions = {
            methodResponses: statusCodes.map((code) => ({
                statusCode: code,
                responseModels: RESPONSE_MODELS[code],
            })),
            ...(requestParameters && { requestParameters }),
            ...(this.authorizer && {
                authorizer: this.authorizer,
                authorizationType: AuthorizationType.COGNITO,
            }),
        };

        resource.addMethod(endpoint.method, integration, methodOptions);
    }
}

