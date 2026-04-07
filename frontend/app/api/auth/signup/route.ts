import { NextResponse } from "next/server";
import {
    CognitoIdentityProviderClient,
    SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createCognitoSecretHash, generateCognitoUsername, getCognitoErrorMessage } from "@/lib/cognito";

export async function POST(req: Request) {
    const { email, password } = await req.json();

    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });
        const username = generateCognitoUsername();
        const secretHash = createCognitoSecretHash(username);

        const command = new SignUpCommand({
            ClientId: process.env.COGNITO_CLIENT_ID!,
            Username: username,
            Password: password,
            ...(secretHash ? { SecretHash: secretHash } : {}),
            UserAttributes: [{ Name: "email", Value: email }],
        });

        await client.send(command);

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        console.error("Signup error:", err);
        return NextResponse.json(
            { success: false, message: getCognitoErrorMessage(err) },
            { status: 400 },
        );
    }
}
