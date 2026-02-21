import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { CognitoUserPool } from "./constructs/auth/cognito-user-pool";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class AuthStack extends Stack {
    public readonly userPool: cognito.UserPool;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, {
            ...props,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        });

        const cognitoUserPool = new CognitoUserPool(this, "CognitoUserPool");
        this.userPool = cognitoUserPool.userPool;
    }
}
