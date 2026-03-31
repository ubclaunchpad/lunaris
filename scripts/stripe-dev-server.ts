/**
 * Stripe local dev server
 *
 * Imports the Lambda api handler directly and serves it as a plain
 * HTTP server so the Stripe CLI can forward webhook events without a proxy.
 *
 * Requires:
 *   STRIPE_SECRET_KEY  — your Stripe test-mode secret key (sk_test_...)
 *   STRIPE_WH_SECRET   — the signing secret printed by `stripe listen` (whsec_...)
 *
 * Usage:
 *   1. npm run db:start && npm run db:create-tables
 *   2. export STRIPE_SECRET_KEY=sk_test_...
 *   3. npm run stripe:dev
 *   4. stripe listen --forward-to localhost:4242/stripe-webhook
 *      (copy the whsec_... and re-run with STRIPE_WH_SECRET=whsec_... npm run stripe:dev)
 */

// Set local defaults BEFORE importing the handler so its module-level code picks them up
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";
process.env.USER_PAYMENTS_TABLE_NAME = process.env.USER_PAYMENTS_TABLE_NAME || "UserPayments";
process.env.USER_BALANCES_TABLE_NAME = process.env.USER_BALANCES_TABLE_NAME || "UserBalances";
process.env.RUNNING_INSTANCES_TABLE_NAME =
    process.env.RUNNING_INSTANCES_TABLE_NAME || "RunningInstances";
process.env.RUNNING_STREAMS_TABLE_NAME =
    process.env.RUNNING_STREAMS_TABLE_NAME || "RunningStreams";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

import http from "http";
import { handler } from "../lambda/src/handlers/api";
import type { APIGatewayProxyEvent } from "aws-lambda";

const PORT = parseInt(process.env.PORT || "4242", 10);

if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Error: STRIPE_SECRET_KEY is not set");
    process.exit(1);
}
if (!process.env.STRIPE_WH_SECRET) {
    console.warn(
        "Warning: STRIPE_WH_SECRET is not set — webhook signature verification will fail.\n" +
            "Run `stripe listen` first, copy the whsec_... secret, then set it and restart.\n",
    );
}

const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const [path, qs] = (req.url ?? "/").split("?");

    const event: APIGatewayProxyEvent = {
        httpMethod: req.method ?? "POST",
        path,
        resource: path,
        headers: req.headers as Record<string, string>,
        multiValueHeaders: {},
        queryStringParameters: qs ? Object.fromEntries(new URLSearchParams(qs)) : null,
        multiValueQueryStringParameters: null,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as APIGatewayProxyEvent["requestContext"],
        body: rawBody,
        isBase64Encoded: false,
    };

    const result = await handler(event);
    res.writeHead(result.statusCode, { "Content-Type": "application/json" });
    res.end(result.body);
    console.log(`${req.method} ${path} -> ${result.statusCode}`);
});

server.listen(PORT, () => {
    console.log(`\nStripe dev server: http://localhost:${PORT}`);
    console.log(
        `stripe listen --forward-to localhost:${PORT}/stripe-webhook\n`,
    );
});
