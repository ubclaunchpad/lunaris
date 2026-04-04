import { handler } from "../../../src/handlers/user-terminate-ec2/terminate-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import EBSWrapper from "../../../src/utils/ebsWrapper";
import DCVWrapper from "../../../src/utils/dcvWrapper";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";

jest.mock("../../../src/utils/ec2Wrapper");
jest.mock("../../../src/utils/ebsWrapper");
jest.mock("../../../src/utils/dcvWrapper");
jest.mock("../../../src/utils/dynamoDbWrapper");

describe("user-terminate-ec2/terminate-ec2", () => {
    let mockEC2: jest.Mocked<EC2Wrapper>;
    let mockEBS: jest.Mocked<EBSWrapper>;
    let mockDCV: jest.Mocked<DCVWrapper>;
    let mockRunningInstances: jest.Mocked<DynamoDBWrapper>;

    const userId = "user-1";
    const instanceId = "i-123";
    const instanceArn = `arn:aws:ec2:us-west-2:111111111111:instance/${instanceId}`;

    beforeEach(() => {
        jest.clearAllMocks();

        mockEC2 = new EC2Wrapper() as jest.Mocked<EC2Wrapper>;
        mockEBS = new EBSWrapper() as jest.Mocked<EBSWrapper>;
        mockDCV = new DCVWrapper(instanceId, userId) as jest.Mocked<DCVWrapper>;
        mockRunningInstances = new DynamoDBWrapper(
            "RunningInstances",
        ) as jest.Mocked<DynamoDBWrapper>;

        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => mockEC2);
        (EBSWrapper as jest.MockedClass<typeof EBSWrapper>).mockImplementation(() => mockEBS);
        (DCVWrapper as jest.MockedClass<typeof DCVWrapper>).mockImplementation(() => mockDCV);
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockRunningInstances,
        );

        mockEC2.getInstanceDetails.mockResolvedValue({ volumes: [{ volumeId: "vol-1" }] });
        mockDCV.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "ok",
        });
        mockEBS.detachEBSVolume.mockResolvedValue({
            volumeId: "vol-1",
            instanceId,
            state: "detached",
        });
        mockEC2.terminateInstance.mockResolvedValue({ instanceId, state: "shutting-down" });
        mockRunningInstances.updateItem.mockResolvedValue(undefined);
    });

    it("terminates successfully with full happy-path outputs", async () => {
        const result = await handler({ userId, instanceId, instanceArn });

        expect(result).toMatchObject({
            success: true,
            instanceId,
            dcvStopped: true,
            detachVolumeState: "detached",
            terminateInstanceState: "shutting-down",
            dynamoDbUpdateStatus: "updated",
        });
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

    it("continues when getting instance details fails", async () => {
        mockEC2.getInstanceDetails.mockRejectedValue(new Error("details failed"));

        const result = await handler({ userId, instanceId, instanceArn });
        expect(result.success).toBe(true);
        expect(mockEC2.terminateInstance).toHaveBeenCalledWith(instanceId);
        expect(result.detachVolumeState).toBe("skipped");
    });

    it("continues when DCV stop throws", async () => {
        mockDCV.stopDCVSession.mockRejectedValue(new Error("dcv failed"));

        const result = await handler({ userId, instanceId, instanceArn });
        expect(result.success).toBe(true);
        expect(result.dcvStopped).toBe(false);
    });

    it("continues when detach throws", async () => {
        mockEBS.detachEBSVolume.mockRejectedValue(new Error("detach failed"));

        const result = await handler({ userId, instanceId, instanceArn });
        expect(result.success).toBe(true);
        expect(result.detachVolumeState).toBe("skipped");
    });

    it("keeps detach skipped when no volume exists", async () => {
        mockEC2.getInstanceDetails.mockResolvedValue({ volumes: [] });

        const result = await handler({ userId, instanceId, instanceArn });
        expect(result.success).toBe(true);
        expect(mockEBS.detachEBSVolume).not.toHaveBeenCalled();
        expect(result.detachVolumeState).toBe("skipped");
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
