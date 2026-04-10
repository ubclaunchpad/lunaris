import { handler } from "../../../src/handlers/user-deploy-ec2/deploy-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";

jest.mock("../../../src/utils/ec2Wrapper");

const BASE_EVENT = {
    userId: "user-1",
    gameId: "game-fortnite",
    amiId: "ami-123",
    instanceType: "g4dn.xlarge",
};

describe("user-deploy-ec2/deploy-ec2", () => {
    const originalEnv = process.env;

    let mockEC2Wrapper: jest.Mocked<EC2Wrapper>;

    beforeEach(() => {
        jest.clearAllMocks();

        process.env = {
            ...originalEnv,
            LAMBDA_REGION: "us-west-2",
            SECURITY_GROUP_ID: "sg-123",
            SUBNET_ID: "subnet-123",
            KEY_PAIR_NAME: "key-123",
            EC2_INSTANCE_PROFILE_NAME: "profile-123",
        };

        mockEC2Wrapper = new EC2Wrapper("us-west-2") as jest.Mocked<EC2Wrapper>;

        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(
            () => mockEC2Wrapper,
        );
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("returns expected success payload using amiId from event", async () => {
        mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue({
            instanceId: "i-123",
            instanceArn: "arn:aws:ec2:us-west-2:111111111111:instance/i-123",
            publicIp: "1.2.3.4",
            availabilityZone: "us-west-2a",
            state: "running",
            createdAt: new Date().toISOString(),
        });

        const result = await handler(BASE_EVENT);

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected success");

        expect(result).toMatchObject({
            instanceId: "i-123",
            instanceArn: "arn:aws:ec2:us-west-2:111111111111:instance/i-123",
            dcvIp: "1.2.3.4",
            dcvPort: 8443,
            dcvUser: "Administrator",
        });
        expect(typeof result.dcvPassword).toBe("string");
        expect(result.dcvPassword.length).toBe(24);
        expect(typeof result.creationTime).toBe("string");

        const cfg = mockEC2Wrapper.createAndWaitForInstance.mock.calls[0][0];
        expect(cfg).toMatchObject({
            userId: "user-1",
            amiId: "ami-123",
            instanceType: "g4dn.xlarge",
            securityGroupIds: ["sg-123"],
            subnetId: "subnet-123",
            keyName: "key-123",
            iamInstanceProfile: "profile-123",
            tags: { GameId: "game-fortnite" },
        });
        expect(cfg.userDataScript).toContain("<powershell>");
        expect(cfg.userDataScript).toContain("dcvserver");
        expect(cfg.userDataScript).toContain("Administrator");
        expect(cfg.userDataScript).toContain(
            'New-NetFirewallRule -DisplayName "Lunaris DCV HTTPS"',
        );
        expect(cfg.userDataScript).toContain(
            'New-NetFirewallRule -DisplayName "Lunaris ACME HTTP"',
        );
        expect(cfg.userDataScript).toContain("win-acme");
        expect(cfg.userDataScript).toContain("wacs.exe");
        expect(cfg.userDataScript).toContain(".nip.io");
    });

    it("handles missing optional env config", async () => {
        delete process.env.SECURITY_GROUP_ID;
        delete process.env.SUBNET_ID;
        delete process.env.KEY_PAIR_NAME;
        delete process.env.EC2_INSTANCE_PROFILE_NAME;

        mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue({
            instanceId: "i-234",
            instanceArn: "arn:aws:ec2:us-west-2:111111111111:instance/i-234",
            publicIp: "5.6.7.8",
            availabilityZone: "us-west-2a",
            state: "running",
            createdAt: new Date().toISOString(),
        });

        await handler({ ...BASE_EVENT, userId: "user-2" });

        const cfg = mockEC2Wrapper.createAndWaitForInstance.mock.calls[0][0];
        expect(cfg.securityGroupIds).toBeUndefined();
        expect(cfg.subnetId).toBeUndefined();
        expect(cfg.keyName).toBeUndefined();
        expect(cfg.iamInstanceProfile).toBeUndefined();
    });

    it("returns error when amiId is missing from event", async () => {
        await expect(
            handler({ userId: "user-1", gameId: "game-1", amiId: "", instanceType: "g4dn.xlarge" }),
        ).resolves.toEqual({
            success: false,
            error: "AMI ID is required but was not provided in the event",
        });
    });

    it("returns error when instance creation fails", async () => {
        mockEC2Wrapper.createAndWaitForInstance.mockRejectedValue(new Error("create failed"));

        await expect(handler(BASE_EVENT)).resolves.toEqual({
            success: false,
            error: "create failed",
        });
    });

    it("stringifies non-Error throws", async () => {
        mockEC2Wrapper.createAndWaitForInstance.mockRejectedValue("weird failure");

        await expect(handler(BASE_EVENT)).resolves.toEqual({
            success: false,
            error: "weird failure",
        });
    });
});
