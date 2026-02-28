import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        CognitoProvider({
            clientId: process.env.COGNITO_CLIENT_ID!,
            clientSecret: process.env.COGNITO_CLIENT_SECRET!,
            issuer: process.env.COGNITO_ISSUER,
        }),
    ],

    callbacks: {
        async jwt({ token, user, account }) {
            if (user) {
                token.userId = user.id;
            }
            if (account) {
                token.accessToken = account.access_token;
                token.idToken = account.id_token;
            }
            return token;
        },

        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.userId as string;
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
