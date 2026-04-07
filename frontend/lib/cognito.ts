import { createHmac, randomUUID } from "crypto";

export interface CognitoTokenPayload {
    sub: string;
    email?: string;
    [key: string]: unknown;
}

export function createCognitoSecretHash(identifier: string) {
    const clientId = process.env.COGNITO_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return undefined;
    }

    return createHmac("sha256", clientSecret).update(`${identifier}${clientId}`).digest("base64");
}

export function generateCognitoUsername() {
    return `user_${randomUUID().replaceAll("-", "")}`;
}

export function decodeJwtPayload<T>(token: string): T {
    const [, payload = ""] = token.split(".");
    const decoded = Buffer.from(payload, "base64url").toString("utf8");

    return JSON.parse(decoded) as T;
}

export function getCognitoErrorMessage(error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "";
    const errorName =
        typeof error === "object" && error !== null && "name" in error
            ? String(error.name)
            : undefined;

    switch (errorName) {
        case "NotAuthorizedException":
        case "UserNotFoundException":
            return "Invalid email or password.";
        case "UserNotConfirmedException":
            return "Check your email for the confirmation code before signing in.";
        case "UsernameExistsException":
            return "An account with this email already exists.";
        case "AliasExistsException":
            return "An account with this email already exists. Try signing in instead.";
        case "InvalidPasswordException":
            return "Password must be at least 8 characters and include upper and lower case letters plus a number.";
        case "CodeMismatchException":
            return "That confirmation code is invalid. Please try again.";
        case "ExpiredCodeException":
            return "That confirmation code has expired. Request a new one and try again.";
        case "CodeDeliveryFailureException":
            return "We couldn't send the verification email. Please try again.";
        case "LimitExceededException":
        case "TooManyRequestsException":
            return "Too many attempts. Please wait a moment and try again.";
        default:
            return errorMessage || "Something went wrong. Please try again.";
    }
}
