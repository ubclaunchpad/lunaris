import { handler } from "../../../src/handlers/user-deploy-ec2/deploy-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import EBSWrapper, { EBSStatusEnum } from "../../../src/utils/ebsWrapper";
import SSMWrapper from "../../../src/utils/ssmWrapper";

jest.mock("../../../src/utils/ec2Wrapper");
jest.mock("../../../src/utils/ebsWrapper");
jest.mock("../../../src/utils/ssmWrapper");

describe("user-deploy-ec2/deploy-ec2", () => {
    const originalEnv = process.env;

    let mockEC2Wrapper: jest.Mocked<EC2Wrapper>;
    let mockEBSWrapper: jest.Mocked<EBSWrapper>;
    let mockSSMWrapper: jest.Mocked<SSMWrapper>;

    beforeEach(() => {
        jest.clearAllMocks();

        process.env = {
            ...originalEnv,
            LAMBDA_REGION: "us-west-2",
            SECURITY_GROUP_ID: "sg-123",
            SUBNET_ID: "subnet-123",
            KEY_PAIR_NAME: "key-123",
            EC2_INSTANCE_PROFILE_NAME: "profile-123",
            BASE_EBS_SNAPSHOT_ID: "snap-123",
        };

        mockEC2Wrapper = new EC2Wrapper("us-west-2") as jest.Mocked<EC2Wrapper>;
        mockEBSWrapper = new EBSWrapper("us-west-2") as jest.Mocked<EBSWrapper>;
        mockSSMWrapper = new SSMWrapper("us-west-2") as jest.Mocked<SSMWrapper>;

        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(
            () => mockEC2Wrapper,
        );
        (EBSWrapper as jest.MockedClass<typeof EBSWrapper>).mockImplementation(
            () => mockEBSWrapper,
        );
        (SSMWrapper as jest.MockedClass<typeof SSMWrapper>).mockImplementation(
            () => mockSSMWrapper,
        );

        mockEBSWrapper.createAndWaitForEBSVolume.mockResolvedValue({
            volumeId: "vol-123",
            status: EBSStatusEnum.AVAILABLE,
        });
        mockEBSWrapper.attachAndWaitForEBSVolume.mockResolvedValue({
            volumeId: "vol-123",
            status: EBSStatusEnum.IN_USE,
        });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("returns expected success payload and passes env-derived config", async () => {
        mockSSMWrapper.getParamFromParamStore.mockResolvedValue("ami-123");
        mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue({
            instanceId: "i-123",
            instanceArn: "arn:aws:ec2:us-west-2:111111111111:instance/i-123",
            publicIp: "1.2.3.4",
            availabilityZone: "us-west-2a",
        });

        const result = await handler({ userId: "user-1" });

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error("Expected success");
        }

        expect(result).toMatchObject({
            instanceId: "i-123",
            instanceArn: "arn:aws:ec2:us-west-2:111111111111:instance/i-123",
            ebsVolumeId: "vol-123",
            dcvIp: "1.2.3.4",
            dcvPort: 8443,
            dcvUser: "Administrator",
        });
        expect(typeof result.dcvPassword).toBe("string");
        expect(result.dcvPassword.length).toBe(24);
        expect(typeof result.creationTime).toBe("string");

        expect(mockSSMWrapper.getParamFromParamStore).toHaveBeenCalledWith("ami_id");
        const cfg = mockEC2Wrapper.createAndWaitForInstance.mock.calls[0][0];
        expect(cfg).toMatchObject({
            userId: "user-1",
            amiId: "ami-123",
            securityGroupIds: ["sg-123"],
            subnetId: "subnet-123",
            keyName: "key-123",
            iamInstanceProfile: "profile-123",
        });
        expect(cfg.userDataScript).toContain("<powershell>");
    });

    it("handles missing optional env config", async () => {
        delete process.env.SECURITY_GROUP_ID;
        delete process.env.SUBNET_ID;
        delete process.env.KEY_PAIR_NAME;
        delete process.env.EC2_INSTANCE_PROFILE_NAME;

        mockSSMWrapper.getParamFromParamStore.mockResolvedValue("ami-123");
        mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue({
            instanceId: "i-234",
            instanceArn: "arn:aws:ec2:us-west-2:111111111111:instance/i-234",
            publicIp: "5.6.7.8",
            availabilityZone: "us-west-2a",
        });

        await handler({ userId: "user-2" });

        const cfg = mockEC2Wrapper.createAndWaitForInstance.mock.calls[0][0];
        expect(cfg.securityGroupIds).toBeUndefined();
        expect(cfg.subnetId).toBeUndefined();
        expect(cfg.keyName).toBeUndefined();
        expect(cfg.iamInstanceProfile).toBeUndefined();
    });

    it("returns error when AMI is missing", async () => {
        mockSSMWrapper.getParamFromParamStore.mockResolvedValue("");

        await expect(handler({ userId: "user-1" })).resolves.toEqual({
            success: false,
            error: "AMI ID not found in Parameter Store",
        });
    });

    it("returns error when instance creation fails", async () => {
        mockSSMWrapper.getParamFromParamStore.mockResolvedValue("ami-123");
        mockEC2Wrapper.createAndWaitForInstance.mockRejectedValue(new Error("create failed"));

        await expect(handler({ userId: "user-1" })).resolves.toEqual({
            success: false,
            error: "create failed",
        });
    });

    it("stringifies non-Error throws", async () => {
        mockSSMWrapper.getParamFromParamStore.mockRejectedValue("weird failure");

        await expect(handler({ userId: "user-1" })).resolves.toEqual({
            success: false,
            error: "weird failure",
        });
    });
});
