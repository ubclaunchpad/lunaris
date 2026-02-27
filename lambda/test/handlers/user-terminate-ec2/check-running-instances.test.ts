import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/check-running-instances";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoMock, ensureInstancesTableEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-terminate-ec2/check-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureInstancesTableEnv();
    })

    afterEach(() => {
        restoreEnv();
    })

    // no env val
    it("throws MissingTableNameEnv when RUNNING_INSTANCES_TABLE_NAME is not set", async () => {
            restoreEnv();
            delete process.env.RUNNING_INSTANCES_TABLE_NAME;

            await expect(handler({ instanceId: "instance-123" })).rejects.toThrow("MissingTableNameEnv");
    });

    // no items, return false
    it("should return false upon no items being returned from DynamoDB", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: [] });

        const result = await handler({ instanceId: "instance-123" });

        expect(result).toEqual({ valid: false });
    });

    // no items, return false
    it("should return false when DynamoDB returns undefined Items", async () => {
        dynamoMock.on(QueryCommand).resolves({ Items: undefined });

        const result = await handler({ instanceId: "instanceId-123" });

        expect(result).toEqual({ valid: false });
    });

    it("propagates DynamoDB errors", async () => {
        dynamoMock.on(QueryCommand).rejects(new Error("ddb-query-error"));

        await expect(handler({ instanceId: "instance-123" })).rejects.toThrow("ddb-query-error");
    });

    // items are returned
    it("should return valid status as TRUE when dynamoDb returns an running instance", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ instanceId: "instance-123", userId: "user-123", status: "running"}]
        })

        const result = await handler({instanceId: "instance-123"})

        expect(result).toEqual({ valid: true})
    })

    it("should return valid status as FALSE when dynamoDb returns an instance with status NOT running", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ instanceId: "instance-123", userId: "user-123", status: "lol"}]
        })

        const result = await handler({instanceId: "instance-123"})

        expect(result).toEqual({ valid: false})
    })

    it("should return valid status as FALSE when dynamoDb returns an instance with no status field", async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [{ instanceId: "instance-123", userId: "user-123"}]
        })

        const result = await handler({instanceId: "instance-123"})

        expect(result).toEqual({ valid: false})
    })


    it("queries by the correct instanceId against the right table", async () => {
            dynamoMock.on(QueryCommand).resolves({ Items: [] });

            await handler({ instanceId: "instance-456" });

            const calls = dynamoMock.commandCalls(QueryCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;
            expect(input.TableName).toBe("test-running-instances");
            expect(input.IndexName).toBe("InstanceIdIndex");
            expect(input.ExpressionAttributeValues).toMatchObject({ ":instanceId": "instance-456" });
            expect(input.ScanIndexForward).toBe(false);
        });

})
