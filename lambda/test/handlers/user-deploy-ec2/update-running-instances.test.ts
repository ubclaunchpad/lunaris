import { describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-deploy-ec2/update-running-instances";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";
import { DEFAULT_INSTANCE_TYPE } from "../../../src/utils/ec2Wrapper";
import { withEnv } from "../../utils/dynamoMock";

jest.mock("../../../src/utils/dynamoDbWrapper");

const BASE_EVENT = {
    instanceId: "i-0abc123def456789",
    instanceArn: "arn:aws:ec2:us-west-2:111122223333:instance/i-0abc123def456789",
    userId: "user-123",
    creationTime: "2024-01-15T10:00:00.000Z",
};

describe("user-deploy-ec2/update-running-instances", () => {
    let mockDb: jest.Mocked<DynamoDBWrapper>;
    let restoreEnv: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDb = new DynamoDBWrapper("test") as jest.Mocked<DynamoDBWrapper>;
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockDb,
        );
        mockDb.updateItem.mockResolvedValue(undefined);
        restoreEnv = withEnv({
            RUNNING_INSTANCES_TABLE_NAME: "test-running-instances",
            LAMBDA_REGION: "us-west-2",
        });
    });

    afterEach(() => restoreEnv());

    it("throws MissingTableNameEnv when table env is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_INSTANCES_TABLE_NAME;
        await expect(handler(BASE_EVENT)).rejects.toThrow("MissingTableNameEnv");
    });

    it("throws when required fields are missing", async () => {
        await expect(handler({ ...BASE_EVENT, instanceArn: "" })).rejects.toThrow(
            "Missing required fields: instanceArn, instanceId",
        );
        await expect(handler({ ...BASE_EVENT, instanceId: "" })).rejects.toThrow(
            "Missing required fields: instanceArn, instanceId",
        );
    });

    it("returns success on valid input", async () => {
        await expect(handler(BASE_EVENT)).resolves.toEqual({
            success: true,
            instanceId: BASE_EVENT.instanceId,
        });
        expect(DynamoDBWrapper).toHaveBeenCalledWith("test-running-instances");
    });

    it("passes key and update config correctly", async () => {
        await handler(BASE_EVENT);

        const [key, config] = mockDb.updateItem.mock.calls[0];
        expect(key).toEqual({ instanceId: BASE_EVENT.instanceId });
        expect(config?.UpdateExpression).toContain("if_not_exists(creationTime");
        expect(config?.ExpressionAttributeNames).toMatchObject({
            "#status": "status",
            "#region": "region",
        });
        expect(config?.ExpressionAttributeValues).toMatchObject({
            ":instanceArn": BASE_EVENT.instanceArn,
            ":userId": BASE_EVENT.userId,
            ":creationTime": BASE_EVENT.creationTime,
            ":status": "running",
            ":region": "us-west-2",
            ":instanceType": DEFAULT_INSTANCE_TYPE,
        });
        expect(typeof config?.ExpressionAttributeValues?.[":lastModifiedTime"]).toBe("string");
    });

    it("defaults region to us-west-2 when LAMBDA_REGION is absent", async () => {
        restoreEnv();
        restoreEnv = withEnv({
            RUNNING_INSTANCES_TABLE_NAME: "test-running-instances",
            LAMBDA_REGION: undefined,
        });

        await handler(BASE_EVENT);
        const [, config] = mockDb.updateItem.mock.calls[0];
        expect(config?.ExpressionAttributeValues?.[":region"]).toBe("us-west-2");
    });

    it("rethrows dynamodb update failures", async () => {
        mockDb.updateItem.mockRejectedValue(new Error("ddb-update-error"));
        await expect(handler(BASE_EVENT)).rejects.toThrow("ddb-update-error");
    });
});
