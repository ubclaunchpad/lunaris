import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import * as generateArnModule from "../../../src/utils/generateArn";
import { handler } from "../../../src/handlers/user-deploy-ec2/resume-deploy-instance";
import { withEnv } from "../../utils/dynamoMock";

jest.mock("../../../src/utils/ec2Wrapper");
jest.mock("../../../src/utils/generateArn");

const INSTANCE_ID = "i-0abc123def456789";
const MOCK_ARN = "arn:aws:ec2:us-west-2:111122223333:instance/i-0abc123def456789";

describe("user-deploy-ec2/resume-deploy-instance", () => {
    let mockEC2Wrapper: jest.Mocked<EC2Wrapper>;
    let restoreEnv: () => void;

    beforeEach(() => {
        jest.clearAllMocks();

        // Wire up the class mock
        mockEC2Wrapper = new EC2Wrapper() as jest.Mocked<EC2Wrapper>;
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(
            () => mockEC2Wrapper,
        );
        mockEC2Wrapper.resumeAndStartInstance = jest
            .fn()
            .mockResolvedValue({ instanceId: INSTANCE_ID, status: "pending" });

        // Default generateArn stub
        (generateArnModule.generateArn as jest.Mock).mockReturnValue(MOCK_ARN);

        restoreEnv = withEnv({
            LAMBDA_REGION: "us-west-2",
            CDK_DEFAULT_ACCOUNT: "111122223333",
        });
    });

    afterEach(() => {
        restoreEnv();
    });

    // ── Input validation ──────────────────────────────────────────────────────

    it("throws when instanceId is an empty string", async () => {
        await expect(handler({ instanceId: "" })).rejects.toThrow(
            "instanceId not found in ResumeDeployInstanceHandler",
        );
    });

    // ── Success path ──────────────────────────────────────────────────────────

    it("returns instanceId, instanceArn and an empty creationTime on success", async () => {
        const result = await handler({ instanceId: INSTANCE_ID });

        expect(result).toEqual({
            instanceId: INSTANCE_ID,
            instanceArn: MOCK_ARN,
            creationTime: "",
        });
    });

    it("creationTime is always an empty string", async () => {
        const result = await handler({ instanceId: INSTANCE_ID });

        expect(result.creationTime).toBe("");
    });

    it("calls resumeAndStartInstance with the correct instanceId", async () => {
        await handler({ instanceId: INSTANCE_ID });

        expect(mockEC2Wrapper.resumeAndStartInstance).toHaveBeenCalledTimes(1);
        expect(mockEC2Wrapper.resumeAndStartInstance).toHaveBeenCalledWith(INSTANCE_ID);
    });

    // ── Region handling ───────────────────────────────────────────────────────

    it("constructs EC2Wrapper with LAMBDA_REGION when set", async () => {
        restoreEnv();
        restoreEnv = withEnv({ LAMBDA_REGION: "eu-west-1", CDK_DEFAULT_ACCOUNT: undefined });

        await handler({ instanceId: INSTANCE_ID });

        expect(EC2Wrapper).toHaveBeenCalledWith("eu-west-1");
    });

    it("constructs EC2Wrapper with 'us-west-2' when LAMBDA_REGION is not set", async () => {
        restoreEnv();
        restoreEnv = withEnv({ LAMBDA_REGION: undefined, CDK_DEFAULT_ACCOUNT: undefined });

        await handler({ instanceId: INSTANCE_ID });

        expect(EC2Wrapper).toHaveBeenCalledWith("us-west-2");
    });

    it("passes LAMBDA_REGION to generateArn when set", async () => {
        restoreEnv();
        restoreEnv = withEnv({ LAMBDA_REGION: "ap-southeast-1", CDK_DEFAULT_ACCOUNT: undefined });

        await handler({ instanceId: INSTANCE_ID });

        expect(generateArnModule.generateArn).toHaveBeenCalledWith("ap-southeast-1", INSTANCE_ID);
    });

    it("passes 'us-west-2' to generateArn when LAMBDA_REGION is not set", async () => {
        restoreEnv();
        restoreEnv = withEnv({ LAMBDA_REGION: undefined, CDK_DEFAULT_ACCOUNT: undefined });

        await handler({ instanceId: INSTANCE_ID });

        expect(generateArnModule.generateArn).toHaveBeenCalledWith("us-west-2", INSTANCE_ID);
    });

    // ── ARN ───────────────────────────────────────────────────────────────────

    it("reflects the ARN returned by generateArn in the response", async () => {
        const customArn = "arn:aws:ec2:eu-west-1:999999999999:instance/i-custom";
        (generateArnModule.generateArn as jest.Mock).mockReturnValue(customArn);

        const result = await handler({ instanceId: INSTANCE_ID });

        expect(result.instanceArn).toBe(customArn);
    });

    // ── Error propagation ─────────────────────────────────────────────────────

    it("propagates errors thrown by resumeAndStartInstance", async () => {
        mockEC2Wrapper.resumeAndStartInstance = jest
            .fn()
            .mockRejectedValue(new Error(`Failed to start instance ${INSTANCE_ID}: access denied`));

        await expect(handler({ instanceId: INSTANCE_ID })).rejects.toThrow(
            `Failed to start instance ${INSTANCE_ID}: access denied`,
        );
    });
});
