import { describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/update-running-instances";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";
import { ensureInstancesTableEnv } from "../../utils/dynamoMock";

jest.mock("../../../src/utils/dynamoDbWrapper");

describe("user-terminate-ec2/update-running-instances", () => {
    let restoreEnv: () => void;
    let mockDb: jest.Mocked<DynamoDBWrapper>;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreEnv = ensureInstancesTableEnv();
        mockDb = new DynamoDBWrapper("table") as jest.Mocked<DynamoDBWrapper>;
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockDb,
        );
        mockDb.updateItem.mockResolvedValue(undefined);
    });

    afterEach(() => restoreEnv());

    it("throws when table env is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_INSTANCES_TABLE_NAME;
        await expect(handler({ instanceId: "i-1", status: "stopped" })).rejects.toThrow(
            "MissingTableNameEnv",
        );
    });

    it("throws when required fields are missing", async () => {
        await expect(handler({ instanceId: "", status: "stopped" })).rejects.toThrow(
            "Missing required fields: instanceId, status",
        );
        await expect(handler({ instanceId: "i-1", status: "" })).rejects.toThrow(
            "Missing required fields: instanceId, status",
        );
    });

    it("forces stored status to stopped and returns success", async () => {
        const result = await handler({ instanceId: "i-1", status: "running" });
        expect(result).toEqual({ success: true, instanceId: "i-1" });

        const [key, config] = mockDb.updateItem.mock.calls[0];
        expect(key).toEqual({ instanceId: "i-1" });
        expect(config?.ExpressionAttributeValues).toMatchObject({ ":status": "stopped" });
        expect(typeof config?.ExpressionAttributeValues?.[":lastModifiedTime"]).toBe("string");
    });

    it("propagates update errors", async () => {
        mockDb.updateItem.mockRejectedValue(new Error("ddb-update"));
        await expect(handler({ instanceId: "i-1", status: "stopped" })).rejects.toThrow(
            "ddb-update",
        );
    });
});
