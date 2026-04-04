import { createHmac } from "crypto";

export interface CognitoTokenPayload {
    sub: string;
    email?: string;
    [key: string]: unknown;
}

export function createCognitoSecretHash(username: string) {
    const clientId = process.env.COGNITO_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return undefined;
    }

    return createHmac("sha256", clientSecret)
        .update(`${username}${clientId}`)
        .digest("base64");
}

export function decodeJwtPayload<T>(token: string): T {
    const [, payload = ""] = token.split(".");
    const decoded = Buffer.from(payload, "base64url").toString("utf8");

    return JSON.parse(decoded) as T;
}

export function getCognitoErrorMessage(error: unknown) {
    const errorName =
        typeof error === "object" && error !== null && "name" in error
            ? String(error.name)
            : undefined;

    switch (errorName) {
        case "NotAuthorizedException":
        case "UserNotFoundException":
            return "Invalid email or password.";
        case "UserNotConfirmedException":
            return "Check your email to verify your account before signing in.";
        case "UsernameExistsException":
            return "An account with this email already exists.";
        case "InvalidPasswordException":
            return "Password must be at least 8 characters and include upper and lower case letters plus a number.";
        case "CodeDeliveryFailureException":
            return "We couldn't send the verification email. Please try again.";
        default:
            return error instanceof Error ? error.message : "Something went wrong. Please try again.";
    }
}
