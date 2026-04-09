import { describe, expect, it, jest } from "@jest/globals";
import { handler as checkRunningStreamsHandler } from "../../src/handlers/user-deploy-ec2/check-running-streams";
import { handler as checkRunningInstancesHandler } from "../../src/handlers/user-deploy-ec2/check-running-instances";
import { handler as deployEc2Handler } from "../../src/handlers/user-deploy-ec2/deploy-ec2";
import { handler as updateRunningStreamsHandler } from "../../src/handlers/user-deploy-ec2/update-running-streams";
import { handler as updateRunningInstancesHandler } from "../../src/handlers/user-deploy-ec2/update-running-instances";
import DynamoDBWrapper from "../../src/utils/dynamoDbWrapper";
import EC2Wrapper from "../../src/utils/ec2Wrapper";
import { withEnv } from "../utils/dynamoMock";

jest.mock("../../src/utils/dynamoDbWrapper");
jest.mock("../../src/utils/ec2Wrapper");

const DEPLOY_EVENT = {
    userId: "u-1",
    gameId: "game-test",
    amiId: "ami-1",
    instanceType: "g4dn.xlarge",
};

describe("UserDeployEC2Workflow Integration", () => {
    let restoreEnv: () => void;
    let mockDb: jest.Mocked<DynamoDBWrapper>;
    let mockEc2: jest.Mocked<EC2Wrapper>;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreEnv = withEnv({
            RUNNING_STREAMS_TABLE_NAME: "running-streams",
            RUNNING_INSTANCES_TABLE_NAME: "running-instances",
            LAMBDA_REGION: "us-west-2",
            SECURITY_GROUP_ID: "sg-1",
            SUBNET_ID: "subnet-1",
            KEY_PAIR_NAME: "kp-1",
            EC2_INSTANCE_PROFILE_NAME: "profile-1",
        });

        mockDb = new DynamoDBWrapper("t") as jest.Mocked<DynamoDBWrapper>;
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockDb,
        );

        mockEc2 = new EC2Wrapper("us-west-2") as jest.Mocked<EC2Wrapper>;
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => mockEc2);
    });

    afterEach(() => restoreEnv());

    it("simulates deploy path and normalized updates", async () => {
        mockDb.queryByUserId.mockResolvedValue([]);
        mockEc2.createAndWaitForInstance.mockResolvedValue({
            instanceId: "i-1",
            instanceArn: "arn:...:i-1",
            publicIp: "1.2.3.4",
            availabilityZone: "us-west-2a",
            state: "running",
            createdAt: new Date().toISOString(),
        });
        mockDb.updateItem.mockResolvedValue(undefined);
        mockDb.queryByStatus.mockResolvedValue([]);

        const streams = await checkRunningStreamsHandler({ userId: "u-1" });
        expect(streams.streamsRunning).toBe(false);

        const instances = await checkRunningInstancesHandler({ userId: "u-1" });
        expect(instances.status).toBe("terminated");

        const deploy = await deployEc2Handler(DEPLOY_EVENT);
        expect(deploy.success).toBe(true);
        if (!deploy.success) throw new Error("expected success");

        const updateStreams = await updateRunningStreamsHandler(
            {
                userId: "u-1",
                instanceId: deploy.instanceId,
                instanceArn: deploy.instanceArn,
                dcvIp: deploy.dcvIp,
                dcvPort: deploy.dcvPort,
                dcvUser: deploy.dcvUser,
                dcvPassword: deploy.dcvPassword,
            },
            {} as any,
        );
        expect(updateStreams.success).toBe(true);

        const updateInstances = await updateRunningInstancesHandler({
            userId: "u-1",
            gameId: "game-test",
            instanceId: deploy.instanceId,
            instanceArn: deploy.instanceArn,
            creationTime: deploy.creationTime,
        });
        expect(updateInstances.success).toBe(true);
    });
});
