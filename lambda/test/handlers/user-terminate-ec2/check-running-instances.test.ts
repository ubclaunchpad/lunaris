import { describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/check-running-instances";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";
import { ensureInstancesTableEnv } from "../../utils/dynamoMock";

jest.mock("../../../src/utils/dynamoDbWrapper");

describe("user-terminate-ec2/check-running-instances", () => {
    let restoreEnv: () => void;
    let mockDb: jest.Mocked<DynamoDBWrapper>;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreEnv = ensureInstancesTableEnv();
        mockDb = new DynamoDBWrapper("table") as jest.Mocked<DynamoDBWrapper>;
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockDb,
        );
    });

    afterEach(() => restoreEnv());

    it("throws when table env is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_INSTANCES_TABLE_NAME;
        await expect(handler({ instanceId: "i-1" })).rejects.toThrow("MissingTableNameEnv");
    });

    it("returns valid=false when no record exists", async () => {
        mockDb.getItem.mockResolvedValue(null);
        await expect(handler({ instanceId: "i-1" })).resolves.toEqual({ valid: false });
    });

    it("returns valid=false when status is missing", async () => {
        mockDb.getItem.mockResolvedValue({ instanceId: "i-1" } as any);
        await expect(handler({ instanceId: "i-1" })).resolves.toEqual({ valid: false });
    });

    it("returns valid=true only for running status", async () => {
        mockDb.getItem.mockResolvedValue({ instanceId: "i-1", status: "running" } as any);
        await expect(handler({ instanceId: "i-1" })).resolves.toEqual({ valid: true });
    });

    it("returns valid=false for non-running statuses", async () => {
        mockDb.getItem.mockResolvedValue({ instanceId: "i-1", status: "stopped" } as any);
        await expect(handler({ instanceId: "i-1" })).resolves.toEqual({ valid: false });
    });

    it("propagates db errors", async () => {
        mockDb.getItem.mockRejectedValue(new Error("ddb-error"));
        await expect(handler({ instanceId: "i-1" })).rejects.toThrow("ddb-error");
    });
});
