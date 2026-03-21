import { describe, expect, it, jest } from "@jest/globals";
import { handler as checkRunningStreamsHandler } from "../../src/handlers/user-terminate-ec2/check-running-streams";
import { handler as checkRunningInstancesHandler } from "../../src/handlers/user-terminate-ec2/check-running-instances";
import { handler as stopDcvHandler } from "../../src/handlers/user-terminate-ec2/stop-dcv-instance";
import { handler as stopEc2Handler } from "../../src/handlers/user-terminate-ec2/stop-ec2";
import { handler as updateStreamsHandler } from "../../src/handlers/user-terminate-ec2/update-running-streams";
import { handler as updateInstancesHandler } from "../../src/handlers/user-terminate-ec2/update-running-instances";
import DynamoDBWrapper from "../../src/utils/dynamoDbWrapper";
import DCVWrapper from "../../src/utils/dcvWrapper";
import EC2Wrapper from "../../src/utils/ec2Wrapper";
import { withEnv } from "../utils/dynamoMock";

jest.mock("../../src/utils/dynamoDbWrapper");
jest.mock("../../src/utils/dcvWrapper");
jest.mock("../../src/utils/ec2Wrapper");

describe("UserTerminateEC2Workflow Integration", () => {
    let restoreEnv: () => void;
    let mockDb: jest.Mocked<DynamoDBWrapper>;
    let mockDcv: jest.Mocked<DCVWrapper>;
    let mockEc2: jest.Mocked<EC2Wrapper>;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreEnv = withEnv({
            RUNNING_STREAMS_TABLE_NAME: "running-streams",
            RUNNING_INSTANCES_TABLE_NAME: "running-instances",
            LAMBDA_REGION: "us-west-2",
        });

        mockDb = new DynamoDBWrapper("t") as jest.Mocked<DynamoDBWrapper>;
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockDb,
        );

        mockDcv = new DCVWrapper("i-1", "u-1") as jest.Mocked<DCVWrapper>;
        (DCVWrapper as jest.MockedClass<typeof DCVWrapper>).mockImplementation(() => mockDcv);

        mockEc2 = new EC2Wrapper("us-west-2") as jest.Mocked<EC2Wrapper>;
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => mockEc2);
    });

    afterEach(() => restoreEnv());

    it("simulates happy-path state progression across handlers", async () => {
        mockDb.query.mockResolvedValue([
            {
                status: "running",
                sessionId: "s-1",
                instanceId: "i-1",
                instanceArn: "arn:...:i-1",
            },
        ]);
        mockDb.getItem.mockResolvedValue({ instanceId: "i-1", status: "running" } as any);
        mockDcv.stopDCVSession.mockResolvedValue({ stoppedSuccessfully: true, message: "ok" });
        mockEc2.stopEC2Instance.mockResolvedValue({ instanceId: "i-1", status: "stopped" });
        mockDb.updateItem.mockResolvedValue(undefined);

        const checkStreams = await checkRunningStreamsHandler({ userId: "u-1" });
        expect(checkStreams.valid).toBe(true);

        const checkInstances = await checkRunningInstancesHandler({ instanceId: "i-1" });
        expect(checkInstances.valid).toBe(true);

        const stopDcv = await stopDcvHandler({ userId: "u-1", instanceId: "i-1" });
        expect(stopDcv.success).toBe(true);

        const stopEc2 = await stopEc2Handler({ userId: "u-1", instanceId: "i-1" });
        expect(stopEc2.status).toBe("stopped");

        const updateStreams = await updateStreamsHandler({
            userId: "u-1",
            instanceArn: "arn:...:i-1",
        });
        expect(updateStreams.success).toBe(true);

        const updateInstances = await updateInstancesHandler({
            instanceId: "i-1",
            status: stopEc2.status,
        });
        expect(updateInstances.success).toBe(true);
    });

    it("short-circuits with invalid stream state", async () => {
        mockDb.query.mockResolvedValue([]);
        const checkStreams = await checkRunningStreamsHandler({ userId: "u-1" });
        expect(checkStreams.valid).toBe(false);
    });
});
