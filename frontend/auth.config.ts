import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config (no Node.js modules)
// Used by middleware. Providers live in auth.ts.
export const authConfig: NextAuthConfig = {
    pages: {
        signIn: "/login",
    },
    providers: [],
    callbacks: {
        authorized({ auth }) {
            return !!auth?.user;
        },
    },
};
