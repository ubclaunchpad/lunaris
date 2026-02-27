import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/stop-dcv-instance";
import DCVWrapper from "../../../src/utils/dcvWrapper";

// TODO: see if claude comes up with more tests

jest.mock("../../../src/utils/dcvWrapper");

describe("user-terminate-ec2/stop-dcv-instance", () => {
    let mockDCVWrapper: jest.Mocked<DCVWrapper>;

    const instanceId = "i-1234567890abcdef0";
    const userId = "test-user-123";

    beforeEach(() => {
        jest.clearAllMocks();
        mockDCVWrapper = new DCVWrapper(instanceId, userId) as jest.Mocked<DCVWrapper>;
        (DCVWrapper as jest.MockedClass<typeof DCVWrapper>).mockImplementation(
            () => mockDCVWrapper,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // return success = True upon stopped succesfully
    it("should return success = True upon stopped succesfully", async () => {
        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "DCV session stopped successfully",
        });
        const result = await handler({ userId: userId, instanceId: instanceId });
        expect(result).toEqual({ success: true });
    });

    // return success = False upon failure when stopping
    it("should success = False upon failure when stopping", async () => {
        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: false,
            message: "DCV session failed to stop",
        });
        const result = await handler({ userId: userId, instanceId: instanceId });
        expect(result).toEqual({ success: false });
    });

    // ── Input validation ──────────────────────────────────────────────────────

    it("throws when userId is missing", async () => {
        await expect(handler({ userId: "", instanceId })).rejects.toThrow(
            "missing userId or instanceId in StopDCVInstanceHandler",
        );
    });

    it("throws when instanceId is missing", async () => {
        await expect(handler({ userId, instanceId: "" })).rejects.toThrow(
            "missing userId or instanceId in StopDCVInstanceHandler",
        );
    });

    it("throws when both userId and instanceId are missing", async () => {
        await expect(handler({ userId: "", instanceId: "" })).rejects.toThrow(
            "missing userId or instanceId in StopDCVInstanceHandler",
        );
    });

    // ── DCVWrapper behaviour ──────────────────────────────────────────────────

    it("constructs DCVWrapper with the instanceId and userId from the event", async () => {
        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "ok",
        });

        await handler({ userId, instanceId });

        expect(DCVWrapper).toHaveBeenLastCalledWith(instanceId, userId);
    });

    it("throws 'didn't return result' when stopDCVSession resolves with null", async () => {
        mockDCVWrapper.stopDCVSession.mockResolvedValue(null as any);

        await expect(handler({ userId, instanceId })).rejects.toThrow("didn't return result");
    });

    it("propagates errors thrown by stopDCVSession", async () => {
        mockDCVWrapper.stopDCVSession.mockRejectedValue(new Error("dcv-internal-error"));

        await expect(handler({ userId, instanceId })).rejects.toThrow("dcv-internal-error");
    });
});
