import { handler } from "../../../src/handlers/user-terminate-ec2/terminate-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import DCVWrapper from "../../../src/utils/dcvWrapper";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";

jest.mock("../../../src/utils/ec2Wrapper");
jest.mock("../../../src/utils/dcvWrapper");
jest.mock("../../../src/utils/dynamoDbWrapper");

describe("user-terminate-ec2/terminate-ec2", () => {
    let mockEC2: jest.Mocked<EC2Wrapper>;
    let mockDCV: jest.Mocked<DCVWrapper>;
    let mockRunningInstances: jest.Mocked<DynamoDBWrapper>;

    const userId = "user-1";
    const instanceId = "i-123";
    const instanceArn = `arn:aws:ec2:us-west-2:111111111111:instance/${instanceId}`;

    beforeEach(() => {
        jest.clearAllMocks();

        mockEC2 = new EC2Wrapper() as jest.Mocked<EC2Wrapper>;
        mockDCV = new DCVWrapper(instanceId, userId) as jest.Mocked<DCVWrapper>;
        mockRunningInstances = new DynamoDBWrapper(
            "RunningInstances",
        ) as jest.Mocked<DynamoDBWrapper>;

        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => mockEC2);
        (DCVWrapper as jest.MockedClass<typeof DCVWrapper>).mockImplementation(() => mockDCV);
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockRunningInstances,
        );

        mockDCV.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "ok",
        });
        mockEC2.terminateInstance.mockResolvedValue({ instanceId, state: "shutting-down" });
        mockRunningInstances.getItem.mockResolvedValue(null);
        mockRunningInstances.updateItem.mockResolvedValue(undefined);
    });

    it("terminates successfully with full happy-path outputs", async () => {
        const result = await handler({ userId, instanceId, instanceArn });

        expect(result).toMatchObject({
            success: true,
            instanceId,
            dcvStopped: true,
            terminateInstanceState: "shutting-down",
            dynamoDbUpdateStatus: "updated",
        });
        expect(result).not.toHaveProperty("detachVolumeState");
    });

    it("uses instanceArn fallback when instanceId is missing", async () => {
        const result = await handler({ userId, instanceArn } as any);
        expect(result.success).toBe(true);
        expect(result.instanceId).toBe(instanceId);
    });

    it("throws for missing userId", async () => {
        await expect(handler({ instanceId, instanceArn } as any)).rejects.toThrow(
            "userId is required",
        );
    });

    it("throws for missing instance identifiers", async () => {
        await expect(handler({ userId } as any)).rejects.toThrow(
            "instanceId or instanceArn is required",
        );
    });

    it("continues when DCV stop throws", async () => {
        mockDCV.stopDCVSession.mockRejectedValue(new Error("dcv failed"));

        const result = await handler({ userId, instanceId, instanceArn });
        expect(result.success).toBe(true);
        expect(result.dcvStopped).toBe(false);
    });

    it("marks running instances update as not_found on update failure", async () => {
        mockRunningInstances.updateItem.mockRejectedValue(new Error("missing"));

        const result = await handler({ userId, instanceId, instanceArn });
        expect(result.success).toBe(true);
        expect(result.dynamoDbUpdateStatus).toBe("not_found");
    });

    it("throws when terminate call fails", async () => {
        mockEC2.terminateInstance.mockRejectedValue(new Error("terminate failed"));

        await expect(handler({ userId, instanceId, instanceArn })).rejects.toThrow(
            "terminate failed",
        );
    });
});
