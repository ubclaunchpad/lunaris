import NextAuth, { CredentialsSignin } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import CredentialsProvider from "next-auth/providers/credentials";
import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createCognitoSecretHash, decodeJwtPayload, type CognitoTokenPayload } from "@/lib/cognito";

async function refreshCognitoTokens(refreshToken: string, username: string): Promise<{
    accessToken: string;
    idToken: string;
    expiresAt: number;
} | null> {
    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });

        const secretHash = process.env.COGNITO_CLIENT_SECRET
            ? createCognitoSecretHash(username)
            : undefined;

        const command = new InitiateAuthCommand({
            AuthFlow: "REFRESH_TOKEN_AUTH",
            ClientId: process.env.COGNITO_CLIENT_ID!,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
                ...(secretHash ? { SECRET_HASH: secretHash } : {}),
            },
        });

        const response = await client.send(command);
        const result = response.AuthenticationResult;

        if (!result?.AccessToken || !result?.IdToken) {
            return null;
        }

        return {
            accessToken: result.AccessToken,
            idToken: result.IdToken,
            expiresAt: Math.floor(Date.now() / 1000) + (result.ExpiresIn ?? 3600),
        };
    } catch {
        return null;
    }
}

type CredentialsUser = {
    id: string;
    email?: string;
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        CognitoProvider({
            clientId: process.env.COGNITO_CLIENT_ID!,
            clientSecret: process.env.COGNITO_CLIENT_SECRET!,
            issuer: process.env.COGNITO_ISSUER,
        }),
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const email = credentials?.email;
                const password = credentials?.password;

                if (typeof email !== "string" || typeof password !== "string") {
                    return null;
                }

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

                    if (!result?.IdToken) {
                        return null;
                    }

                    const payload = decodeJwtPayload<CognitoTokenPayload>(result.IdToken);

                    return {
                        id: payload.sub,
                        email: payload.email ?? email,
                        accessToken: result.AccessToken,
                        idToken: result.IdToken,
                        refreshToken: result.RefreshToken,
                    };
                } catch (error) {
                    const err = new CredentialsSignin();
                    err.code = "invalid";
                    throw err;
                }
            },
        }),
    ],

    callbacks: {
        async jwt({ token, user, account }) {
            if (user) {
                const credentialsUser = user as CredentialsUser;

                token.userId = user.id;
                token.email = user.email;
                token.accessToken = credentialsUser.accessToken ?? token.accessToken;
                token.idToken = credentialsUser.idToken ?? token.idToken;
                token.refreshToken = credentialsUser.refreshToken ?? token.refreshToken;

                // Store expiry from the decoded ID token
                if (token.idToken) {
                    const payload = decodeJwtPayload<{ exp?: number }>(token.idToken as string);
                    token.expiresAt = payload.exp;
                }
            }

            if (account?.provider === "cognito") {
                token.accessToken = account.access_token;
                token.idToken = account.id_token;
                token.refreshToken = account.refresh_token;
                token.expiresAt = account.expires_at;
            }

            // Refresh if token expires within the next 60 seconds
            const expiresAt = token.expiresAt as number | undefined;
            if (expiresAt && Date.now() / 1000 > expiresAt - 60) {
                const refreshToken = token.refreshToken as string | undefined;
                if (refreshToken) {
                    const refreshed = await refreshCognitoTokens(refreshToken, token.userId as string ?? "");
                    if (refreshed) {
                        token.accessToken = refreshed.accessToken;
                        token.idToken = refreshed.idToken;
                        token.expiresAt = refreshed.expiresAt;
                    }
                }
            }

            return token;
        },

        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.userId as string;

                if (typeof token.email === "string") {
                    session.user.email = token.email;
                }
            }

            session.accessToken = token.accessToken as string;
            session.idToken = token.idToken as string;

            return session;
        },
    },

    pages: {
        signIn: "/login",
    },
});
