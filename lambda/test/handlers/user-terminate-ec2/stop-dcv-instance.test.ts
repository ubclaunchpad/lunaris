import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/stop-dcv-instance";
import DCVWrapper from "../../../src/utils/dcvWrapper";

// TODO: see if claude comes up with more tests

jest.mock("../../../src/utils/dcvWrapper");

describe("user-terminate-ec2/stop-dcv-instance", () => {
    let mockDCVWrapper: jest.Mocked<DCVWrapper>

    const instanceId = "i-1234567890abcdef0";
    const userId = "test-user-123";

    beforeEach(() => {
        jest.clearAllMocks()
        mockDCVWrapper = new DCVWrapper(instanceId, userId) as jest.Mocked<DCVWrapper>;
        (DCVWrapper as jest.MockedClass<typeof DCVWrapper>).mockImplementation(
            () => mockDCVWrapper,
        );

    })


    afterEach(() => {
        jest.clearAllMocks()
    })

    // return success = True upon stopped succesfully
    it("should return success = True upon stopped succesfully", async () => {
        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "DCV session stopped successfully",
        });
        const result = await handler({userId: userId, instanceId: instanceId})
        expect(result).toEqual({success: true})

    })

    // return success = False upon failure when stopping
    it("should success = False upon failure when stopping", async () => {
        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: false,
            message: "DCV session failed to stop",
        });
        const result = await handler({userId: userId, instanceId: instanceId})
        expect(result).toEqual({success: false})

    })


})


