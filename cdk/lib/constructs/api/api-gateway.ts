import { Construct } from "constructs";
import {
    LambdaRestApi,
    LambdaIntegration,
    CognitoUserPoolsAuthorizer,
    AuthorizationType,
    Cors,
    MethodOptions,
    GatewayResponse,
    ResponseType,
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
    statusCodes: string[];
    queryParams?: string[];
    noAuth?: boolean;
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
    {
        path: "checkout-session",
        method: "POST",
        statusCodes: ["200", "400"],
    },
    {
        path: "checkout-session",
        method: "GET",
        statusCodes: ["200", "400"],
        queryParams: ["method.request.querystring.sessionId"],
    },
    {
        path: "stripe-webhook",
        method: "POST",
        statusCodes: ["200", "400"],
        noAuth: true,
    },
    {
        path: "games",
        method: "GET",
        statusCodes: ["200", "500"],
        noAuth: true,
    },
    {
        path: "games/{gameId}",
        method: "GET",
        statusCodes: ["200", "400", "404", "500"],
        noAuth: true,
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
                // allowCredentials must NOT be true when allowOrigins is '*'
            },
        });

        // API Gateway strips CORS headers from 4XX responses produced by the
        // authorizer before the integration ever runs.  These GatewayResponses
        // re-add the headers so the browser sees a proper CORS error instead of
        // the opaque "CORS header missing" message.
        const corsHeaders = {
            "Access-Control-Allow-Origin": "'*'",
            "Access-Control-Allow-Headers":
                "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        };

        new GatewayResponse(this, "UnauthorizedGatewayResponse", {
            restApi: this.restApi,
            type: ResponseType.UNAUTHORIZED,
            responseHeaders: corsHeaders,
        });

        new GatewayResponse(this, "Default4xxGatewayResponse", {
            restApi: this.restApi,
            type: ResponseType.DEFAULT_4XX,
            responseHeaders: corsHeaders,
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
        // Support nested paths (e.g. "games/{gameId}") by traversing each segment
        const segments = endpoint.path.split("/");
        let resource = this.restApi.root.getResource(segments[0]) ?? this.restApi.root.addResource(segments[0]);
        for (let i = 1; i < segments.length; i++) {
            resource = resource.getResource(segments[i]) ?? resource.addResource(segments[i]);
        }

        const useAuth = this.authorizer && !endpoint.noAuth;

        const statusCodes = useAuth ? [...endpoint.statusCodes, "401"] : endpoint.statusCodes;

        // With authorizer, userId comes from the token so query params are optional
        const requestParameters = endpoint.queryParams?.length
            ? Object.fromEntries(endpoint.queryParams.map((param) => [param, !useAuth]))
            : undefined;

        const methodOptions: MethodOptions = {
            methodResponses: statusCodes.map((code) => ({
                statusCode: code,
                responseModels: RESPONSE_MODELS[code],
            })),
            ...(requestParameters && { requestParameters }),
            ...(useAuth && {
                authorizer: this.authorizer,
                authorizationType: AuthorizationType.COGNITO,
            }),
        };

        resource.addMethod(endpoint.method, integration, methodOptions);
    }
}
