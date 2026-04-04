import { NextResponse } from "next/server";
import {
    CognitoIdentityProviderClient,
    SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createCognitoSecretHash, getCognitoErrorMessage } from "@/lib/cognito";

export async function POST(req: Request) {
    const { email, password } = await req.json();

    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });
        const secretHash = createCognitoSecretHash(email);

        const command = new SignUpCommand({
            ClientId: process.env.COGNITO_CLIENT_ID!,
            Username: email,
            Password: password,
            ...(secretHash ? { SecretHash: secretHash } : {}),
            UserAttributes: [
                {
                    Name: "email",
                    Value: email,
                },
            ],
        });

        const response = await client.send(command);
        const userConfirmed = response.UserConfirmed ?? false;

        return NextResponse.json({
            success: true,
            userConfirmed,
            message: userConfirmed
                ? "Account created successfully."
                : "Account created. Check your email to verify your address before signing in.",
        });
    } catch (err: unknown) {
        console.error("Signup error:", err);
        return NextResponse.json(
            { success: false, message: getCognitoErrorMessage(err) },
            { status: 400 },
        );
    }
}
