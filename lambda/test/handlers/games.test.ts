import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../src/handlers/api";
import { dynamoMock, ensureGamesTableEnv, withEnv } from "../utils/dynamoMock";
import { APIGatewayProxyEvent } from "aws-lambda";

let restoreEnv: () => void;

describe("Games Handlers", () => {
    beforeEach(() => {
        // Always start fresh with proper env
        restoreEnv = ensureGamesTableEnv();
        dynamoMock.reset();
    });

    afterEach(() => {
        restoreEnv();
        dynamoMock.reset();
    });

    describe("handleListGames", () => {
        it("should return 500 if Games table is not configured", async () => {
            restoreEnv();
            const localRestore = withEnv({ GAMES_TABLE_NAME: undefined });

            const event = {
                resource: "/games",
                path: "/games",
                httpMethod: "GET",
            } as unknown as APIGatewayProxyEvent;

            const response = await handler(event);

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe("Internal Server Error");
            expect(body.message).toBe("Games table not configured");

            localRestore();
        });

        it("should handle DynamoDB errors gracefully", async () => {
            dynamoMock.on(ScanCommand).rejects(new Error("DynamoDB scan error"));

            const event = {
                resource: "/games",
                path: "/games",
                httpMethod: "GET",
            } as unknown as APIGatewayProxyEvent;

            const response = await handler(event);

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe("Internal Server Error");
            expect(body.message).toContain("DynamoDB scan error");
        });
    });

    describe("handleGetGameById", () => {
        it("should return 400 if gameId is missing", async () => {
            const event = {
                resource: "/games/{gameId}",
                path: "/games/",
                httpMethod: "GET",
                pathParameters: {},
            } as unknown as APIGatewayProxyEvent;

            const response = await handler(event);

            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe("Bad Request");
            expect(body.message).toContain("gameId");
        });

        it("should return 500 if Games table is not configured", async () => {
            restoreEnv();
            const localRestore = withEnv({ GAMES_TABLE_NAME: undefined });

            const event = {
                resource: "/games/{gameId}",
                path: "/games/test-game",
                httpMethod: "GET",
                pathParameters: { gameId: "test-game" },
            } as unknown as APIGatewayProxyEvent;

            const response = await handler(event);

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe("Internal Server Error");
            expect(body.message).toBe("Games table not configured");

            localRestore();
        });

        it("should handle DynamoDB errors gracefully", async () => {
            dynamoMock.on(GetCommand).rejects(new Error("DynamoDB get error"));

            const event = {
                resource: "/games/{gameId}",
                path: "/games/test-game",
                httpMethod: "GET",
                pathParameters: { gameId: "test-game" },
            } as unknown as APIGatewayProxyEvent;

            const response = await handler(event);

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe("Internal Server Error");
            expect(body.message).toContain("DynamoDB get error");
        });
    });
});
