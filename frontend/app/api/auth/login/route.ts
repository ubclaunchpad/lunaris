import { NextResponse } from "next/server";
import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createCognitoSecretHash, getCognitoErrorMessage } from "@/lib/cognito";

export async function POST(req: Request) {
    const { email, password } = await req.json();

    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });
        const secretHash = createCognitoSecretHash(email);

        const command = new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: process.env.COGNITO_CLIENT_ID!,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
                ...(secretHash ? { SECRET_HASH: secretHash } : {}),
            },
        });

        const response = await client.send(command);
        const result = response.AuthenticationResult;

        if (!result?.IdToken || !result.AccessToken) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Additional sign-in steps are required for this account.",
                },
                { status: 400 },
            );
        }

        return NextResponse.json({
            success: true,
            idToken: result?.IdToken,
            accessToken: result?.AccessToken,
            refreshToken: result?.RefreshToken,
        });
    } catch (err: unknown) {
        console.error("Cognito error:", err);
        return NextResponse.json(
            { success: false, message: getCognitoErrorMessage(err) },
            { status: 400 },
        );
    }
}
