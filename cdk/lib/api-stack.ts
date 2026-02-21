import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Function } from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { ApiGateway } from "./constructs/api/api-gateway";

export interface ApiStackProps extends StackProps {
    apiFunction: Function;
    userPool?: cognito.UserPool;
}

export class ApiStack extends Stack {
    constructor(scope: Construct, id: string, props: ApiStackProps) {
        const { apiFunction, userPool, ...stackProps } = props;
        super(scope, id, {
            ...stackProps,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        });

        new ApiGateway(this, "ApiGateway", {
            apiFunction,
            userPool,
        });
    }
}
