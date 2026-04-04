import { describe, expect, it, jest } from "@jest/globals";
import { countActiveInstances } from "../../src/utils/activeInstanceCount";
import DynamoDBWrapper from "../../src/utils/dynamoDbWrapper";

describe("countActiveInstances", () => {
    it("sums running and pending query results", async () => {
        const mockQueryByStatus = jest.fn((status: string) =>
            status === "running" ? Promise.resolve([{}, {}]) : Promise.resolve([{}]),
        );
        const wrapper = { queryByStatus: mockQueryByStatus } as unknown as DynamoDBWrapper;

        const n = await countActiveInstances(wrapper);

        expect(n).toBe(3);
        expect(mockQueryByStatus).toHaveBeenCalledWith("running");
        expect(mockQueryByStatus).toHaveBeenCalledWith("pending");
    });
});
