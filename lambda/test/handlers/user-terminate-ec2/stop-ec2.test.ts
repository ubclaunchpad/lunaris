import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/stop-ec2";
import EC2Wrapper from "../../../src/utils/ec2Wrapper";
import { withEnv } from "../../utils/dynamoMock";


jest.mock("../../../src/utils/EC2Wrapper")
let restoreEnv: () => void;


describe("user-terminate-ec2/stop-ec2", () => {
    let mockEC2Wrapper : jest.Mocked<EC2Wrapper>

    beforeEach(() => {
        jest.clearAllMocks()
        mockEC2Wrapper = new EC2Wrapper() as jest.Mocked<EC2Wrapper>
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(
            () => mockEC2Wrapper
        )
        restoreEnv = withEnv({ LAMBDA_REGION: "us-east-2" })

    })

    afterEach(() => {
        restoreEnv();
    })


    // throw error no env var test
    it("should throw MissingLambdaRegionEnv when LAMBDA_REGION not found", async () => {
        restoreEnv()
        delete process.env.LAMBDA_REGION;

        await expect(handler({ instanceId: "instance-123", userId: 'user-123'})).rejects.toThrow(
            "MissingLambdaRegionEnv"
        )

    })
    // throw error when status not stopped
    it("should throw InvalidStatus when result status is NOT stopped", async () => {
        mockEC2Wrapper.stopEC2Instance.mockResolvedValue({
            status: "notStopped",
            instanceId: "instance-123"
        })

        await expect(handler({ instanceId: "instance-123", userId: "user-123"})).rejects.toThrow(
            "InvalidStatus"
        )
    })

    // return status = stopped when success
    it("should properly return success when status is stopped", async () => {
        mockEC2Wrapper.stopEC2Instance.mockResolvedValue({
            status: "stopped",
            instanceId: "instance-123"
        })

        const result = await handler({userId: "user-123", instanceId: "instance-123"})

        expect(result).toEqual({
            status: "stopped",
            instanceId: "instance-123"
        })
    })

})
