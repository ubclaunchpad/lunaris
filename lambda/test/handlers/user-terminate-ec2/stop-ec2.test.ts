import { describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/stop-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import { withEnv } from "../../utils/dynamoMock";

jest.mock("../../../src/utils/ec2Wrapper");

describe("user-terminate-ec2/stop-ec2", () => {
    let restoreEnv: () => void;
    let mockEC2: jest.Mocked<EC2Wrapper>;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreEnv = withEnv({ LAMBDA_REGION: "us-east-2" });
        mockEC2 = new EC2Wrapper() as jest.Mocked<EC2Wrapper>;
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => mockEC2);
    });

    afterEach(() => restoreEnv());

    it("throws when LAMBDA_REGION is missing", async () => {
        restoreEnv();
        delete process.env.LAMBDA_REGION;
        await expect(handler({ instanceId: "i-1", userId: "u-1" })).rejects.toThrow(
            "MissingLambdaRegionEnv",
        );
    });

    it("returns stop result for stopped status", async () => {
        mockEC2.stopEC2Instance.mockResolvedValue({ instanceId: "i-1", status: "stopped" });
        await expect(handler({ instanceId: "i-1", userId: "u-1" })).resolves.toEqual({
            instanceId: "i-1",
            status: "stopped",
        });
    });

    it("returns stop result for stopping status", async () => {
        mockEC2.stopEC2Instance.mockResolvedValue({ instanceId: "i-1", status: "stopping" });
        await expect(handler({ instanceId: "i-1", userId: "u-1" })).resolves.toEqual({
            instanceId: "i-1",
            status: "stopping",
        });
    });

    it("throws InvalidStatus for unexpected status", async () => {
        mockEC2.stopEC2Instance.mockResolvedValue({ instanceId: "i-1", status: "pending" } as any);
        await expect(handler({ instanceId: "i-1", userId: "u-1" })).rejects.toThrow(
            "InvalidStatus",
        );
    });

    it("propagates wrapper errors", async () => {
        mockEC2.stopEC2Instance.mockRejectedValue(new Error("ec2-failure"));
        await expect(handler({ instanceId: "i-1", userId: "u-1" })).rejects.toThrow("ec2-failure");
    });
});
