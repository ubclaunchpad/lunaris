import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
        } & DefaultSession["user"];
        accessToken?: string;
        idToken?: string;
        refreshToken?: string;
    }

    interface User {
        id: string;
        accessToken?: string;
        idToken?: string;
        refreshToken?: string;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        userId?: string;
        accessToken?: string;
        idToken?: string;
        refreshToken?: string;
        expiresAt?: number;
    }
}
