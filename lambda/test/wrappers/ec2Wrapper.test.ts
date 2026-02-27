import {
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning,
    waitUntilInstanceTerminated,
    waitUntilInstanceStopped,
    CreateImageCommand,
    CreateTagsCommand,
    TerminateInstancesCommand,
    StartInstancesCommand,
    StopInstancesCommand,
    InstanceStateName,
} from "@aws-sdk/client-ec2";
import EC2Wrapper, { EC2InstanceConfig, ErrorMessages } from "../../src/utils/ec2Wrapper";
import { ec2Mock, resetAllMocks } from "../__mocks__/aws-mocks";

jest.mock("@aws-sdk/client-ec2", () => {
    const actual = jest.requireActual("@aws-sdk/client-ec2");
    return {
        ...actual,
        waitUntilInstanceRunning: jest.fn(),
        waitUntilInstanceTerminated: jest.fn(),
        waitUntilInstanceStopped: jest.fn(),
    };
});

describe("EC2Wrapper", () => {
    const createMockInstance = (overrides = {}) => ({
        InstanceId: "i-1234567890abcdef0",
        State: { Name: "pending" as const },
        InstanceType: "t3.micro" as const,
        Placement: { AvailabilityZone: "us-east-1a" },
        BlockDeviceMappings: [],
        PublicIpAddress: "1.2.3.4",
        PrivateIpAddress: "10.0.0.1",
        LaunchTime: new Date(),
        ...overrides,
    });

    const mockEC2Success = (instanceId = "i-test123", overrides = {}) => {
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [createMockInstance({ InstanceId: instanceId, ...overrides })],
        });
    };

    const mockWaiterSuccess = () => {
        (waitUntilInstanceRunning as jest.Mock).mockResolvedValueOnce({
            state: "SUCCESS",
        });
    };

    const mockDescribeInstancesSuccess = (instanceId = "i-test123", overrides = {}) => {
        ec2Mock.on(DescribeInstancesCommand).resolves({
            Reservations: [
                {
                    Instances: [
                        createMockInstance({
                            InstanceId: instanceId,
                            State: { Name: "running" },
                            ...overrides,
                        }),
                    ],
                },
            ],
        });
    };

    const mockTerminateInstancesSuccess = (instanceId = "i-test123") => {
        ec2Mock.on(TerminateInstancesCommand).resolves({
            TerminatingInstances: [
                { InstanceId: instanceId, CurrentState: { Name: "shutting-down" } },
            ],
        });
    };

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
    });

    // TODO: test creating with ami
    describe("createInstance", () => {
        it("should create EC2 instance with all required fields", async () => {
            const mockInstanceId = "i-test123";
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user-123",
                instanceType: "t3.medium",
            };

            mockEC2Success(mockInstanceId);

            const ec2Wrapper = new EC2Wrapper("us-east-1");
            const result = await ec2Wrapper.createInstance(mockConfig);

            expect(result.instanceId).toBe(mockInstanceId);
            expect(result.state).toBe("pending");
            expect(result.instanceArn).toContain(mockInstanceId);
            expect(result.instanceArn).toContain("us-east-1");
            expect(result.createdAt).toBeDefined();
            expect(result.publicIp).toBe("1.2.3.4");
            expect(result.privateIp).toBe("10.0.0.1");

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;
            expect(input.InstanceType).toBe("t3.medium");
            expect(input.MinCount).toBe(1);
            expect(input.MaxCount).toBe(1);

            const tags = input.TagSpecifications?.[0].Tags;
            const userIdTag = tags?.find((t: any) => t.Key === "userId");
            expect(userIdTag?.Value).toBe("test-user-123");
        });

        it("should use BasicDCV launch template", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
            };

            mockEC2Success();

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.createInstance(mockConfig);

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            const input = calls[0].args[0].input;
            expect(input.LaunchTemplate?.LaunchTemplateName).toBe("BasicDCV");
        });

        it("should throw error when instance limit exceeded", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: "InstanceLimitExceeded",
                message: "You have exceeded your instance limit",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig)).rejects.toThrow(
                "Cannot create instance: Account instance limit exceeded",
            );
        });

        it("should throw error when userId is empty", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "",
                instanceType: "t3.micro",
            };

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig)).rejects.toThrow(
                "userId is required and cannot be empty",
            );
        });

        it("should throw error when subnet ID not found", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
                subnetId: "subnet-invalid",
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: "InvalidSubnetID.NotFound",
                message: "Subnet not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig)).rejects.toThrow(
                "Subnet ID subnet-invalid not found",
            );
        });

        it("should throw error when security group not found", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
                securityGroupIds: ["sg-invalid"],
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: "InvalidGroup.NotFound",
                message: "Security group not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig)).rejects.toThrow(
                "One or more security groups not found",
            );
        });

        it("should throw error when key pair not found", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
                keyName: "invalid-keypair",
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: "InvalidKeyPair.NotFound",
                message: "Key pair not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig)).rejects.toThrow(
                "Key pair 'invalid-keypair' not found",
            );
        });

        it("should create EC2 instance with existing AMI ID", async () => {
            const mockInstanceId = "i-ami-test";
            const mockAmiId = "ami-1234567890abcdef0";
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user-123",
                instanceType: "t3.medium",
                amiId: mockAmiId,
            };

            mockEC2Success(mockInstanceId);

            const ec2Wrapper = new EC2Wrapper("us-east-1");
            const result = await ec2Wrapper.createInstance(mockConfig);

            expect(result.instanceId).toBe(mockInstanceId);
            expect(result.state).toBe("pending");

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;
            expect(input.ImageId).toBe(mockAmiId);
        });
    });

    describe("waitForInstanceRunning", () => {
        it("should wait for instance and return running state", async () => {
            mockWaiterSuccess();
            mockDescribeInstancesSuccess("i-wait-test");

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.waitForInstanceRunning("i-wait-test");

            expect(result.state).toBe("running");
            expect(result.instanceId).toBe("i-wait-test");
            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });

        it("should throw error when waiter times out", async () => {
            (waitUntilInstanceRunning as jest.Mock).mockRejectedValue({
                name: "WaiterTimedOut",
                message: "Timeout waiting for instance",
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.waitForInstanceRunning("i-timeout-test")).rejects.toThrow(
                "Timeout waiting for instance i-timeout-test to reach running state",
            );
        });

        it("should throw generic error when wait fails", async () => {
            (waitUntilInstanceRunning as jest.Mock).mockRejectedValue({
                name: "UnknownError",
                message: "Unknown error",
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.waitForInstanceRunning("i-error-test")).rejects.toThrow(
                "Error waiting for instance i-error-test",
            );
        });
    });

    describe("createAndWaitForInstance", () => {
        it("should create and wait for instance successfully", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
            };

            mockEC2Success("i-create-wait");
            mockWaiterSuccess();
            mockDescribeInstancesSuccess("i-create-wait");

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.createAndWaitForInstance(mockConfig);

            expect(result.state).toBe("running");
            expect(result.instanceId).toBe("i-create-wait");
            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });

        it("should create instance without waiting when waitForRunning is false", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
            };

            mockEC2Success("i-no-wait");

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.createAndWaitForInstance(mockConfig, false);

            expect(result.instanceId).toBe("i-no-wait");
            expect(result.state).toBe("pending");
            expect(waitUntilInstanceRunning).not.toHaveBeenCalled();
        });

        it("should wrap error with additional context when creation fails", async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: "test-user",
                instanceType: "t3.micro",
            };

            ec2Mock.on(RunInstancesCommand).rejects(new Error("Network error"));

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createAndWaitForInstance(mockConfig)).rejects.toThrow(
                "Failed to create and wait for instance",
            );
        });
    });

    describe("snapshotAMIImage", () => {
        it("should successfully create AMI snapshot with userId", async () => {
            const mockInstanceId = "i-snapshot-test";
            const mockUserId = "test-user-123";
            const mockImageId = "ami-snapshot123";

            ec2Mock.on(CreateImageCommand).resolves({
                ImageId: mockImageId,
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId);

            expect(result).toBe(mockImageId);

            const calls = ec2Mock.commandCalls(CreateImageCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;

            expect(input.InstanceId).toBe(mockInstanceId);
            expect(input.Name).toContain("Lunaris-DCV");
            expect(input.Name).toContain(mockUserId);
            expect(input.NoReboot).toBe(true);
            expect(input.Description).toContain(mockUserId);

            // Check image tags
            const imageTags = input.TagSpecifications?.[0].Tags;
            expect(imageTags?.find((t: any) => t.Key === "CreatedBy")?.Value).toBe("Lunaris");
            expect(imageTags?.find((t: any) => t.Key === "HasDCV")?.Value).toBe("true");
            expect(imageTags?.find((t: any) => t.Key === "UserId")?.Value).toBe(mockUserId);
            expect(imageTags?.find((t: any) => t.Key === "SourceInstance")?.Value).toBe(
                mockInstanceId,
            );

            // Check snapshot tags
            const snapshotTags = input.TagSpecifications?.[1].Tags;
            expect(snapshotTags?.find((t: any) => t.Key === "CreatedBy")?.Value).toBe("Lunaris");
        });

        it("should throw error when ImageId is undefined", async () => {
            const mockInstanceId = "i-snapshot-fail";
            const mockUserId = "test-user";

            ec2Mock.on(CreateImageCommand).resolves({
                ImageId: undefined,
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId)).rejects.toThrow(
                `AMI ID is undefined for this instance ${mockInstanceId}`,
            );
        });

        it("should throw error when snapshot creation fails", async () => {
            const mockInstanceId = "i-snapshot-error";
            const mockUserId = "test-user";

            ec2Mock.on(CreateImageCommand).rejects({
                name: "InvalidInstanceID.NotFound",
                message: "Instance not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId)).rejects.toThrow();
        });
    });

    describe("getInstance", () => {
        it("should successfully retrieve instance details", async () => {
            const mockInstanceId = "i-get-test";
            const mockInstance = createMockInstance({ InstanceId: mockInstanceId });

            ec2Mock.on(DescribeInstancesCommand).resolves({
                Reservations: [
                    {
                        Instances: [mockInstance],
                    },
                ],
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.getInstance(mockInstanceId);

            expect(result.InstanceId).toBe(mockInstanceId);
            expect(result.State?.Name).toBe("pending");

            const calls = ec2Mock.commandCalls(DescribeInstancesCommand);
            expect(calls).toHaveLength(1);
            expect(calls[0].args[0].input.InstanceIds).toContain(mockInstanceId);
        });

        it("should throw error when getInstance fails", async () => {
            const mockInstanceId = "i-not-found";

            ec2Mock.on(DescribeInstancesCommand).rejects({
                name: "InvalidInstanceID.NotFound",
                message: "Instance not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.getInstance(mockInstanceId)).rejects.toThrow();
        });
    });

    describe("modifyInstanceTag", () => {
        it("should successfully modify instance tag", async () => {
            const mockInstanceId = "i-tag-test";
            const mockKey = "dcvConfigured";
            const mockValue = "true";

            ec2Mock.on(CreateTagsCommand).resolves({});

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.modifyInstanceTag(mockInstanceId, mockKey, mockValue);

            const calls = ec2Mock.commandCalls(CreateTagsCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;

            expect(input.Resources).toContain(mockInstanceId);
            expect(input.Tags).toHaveLength(1);
            expect(input.Tags?.[0].Key).toBe(mockKey);
            expect(input.Tags?.[0].Value).toBe(mockValue);
        });

        it("should throw error when modifyInstanceTag fails", async () => {
            const mockInstanceId = "i-tag-error";
            const mockKey = "test-key";
            const mockValue = "test-value";

            ec2Mock.on(CreateTagsCommand).rejects({
                name: "InvalidInstanceID.NotFound",
                message: "Instance not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(
                ec2Wrapper.modifyInstanceTag(mockInstanceId, mockKey, mockValue),
            ).rejects.toThrow();
        });
    });

    describe("snapshotAMIImage", () => {
        it("should successfully create AMI snapshot with userId", async () => {
            const mockInstanceId = "i-snapshot-test";
            const mockUserId = "test-user-123";
            const mockImageId = "ami-snapshot123";

            ec2Mock.on(CreateImageCommand).resolves({
                ImageId: mockImageId,
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId);

            expect(result).toBe(mockImageId);

            const calls = ec2Mock.commandCalls(CreateImageCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;

            expect(input.InstanceId).toBe(mockInstanceId);
            expect(input.Name).toContain("Lunaris-DCV");
            expect(input.Name).toContain(mockUserId);
            expect(input.NoReboot).toBe(true);
            expect(input.Description).toContain(mockUserId);

            // Check image tags
            const imageTags = input.TagSpecifications?.[0].Tags;
            expect(imageTags?.find((t: any) => t.Key === "CreatedBy")?.Value).toBe("Lunaris");
            expect(imageTags?.find((t: any) => t.Key === "HasDCV")?.Value).toBe("true");
            expect(imageTags?.find((t: any) => t.Key === "UserId")?.Value).toBe(mockUserId);
            expect(imageTags?.find((t: any) => t.Key === "SourceInstance")?.Value).toBe(
                mockInstanceId,
            );

            // Check snapshot tags
            const snapshotTags = input.TagSpecifications?.[1].Tags;
            expect(snapshotTags?.find((t: any) => t.Key === "CreatedBy")?.Value).toBe("Lunaris");
        });

        it("should throw error when ImageId is undefined", async () => {
            const mockInstanceId = "i-snapshot-fail";
            const mockUserId = "test-user";

            ec2Mock.on(CreateImageCommand).resolves({
                ImageId: undefined,
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId)).rejects.toThrow(
                `AMI ID is undefined for this instance ${mockInstanceId}`,
            );
        });

        it("should throw error when snapshot creation fails", async () => {
            const mockInstanceId = "i-snapshot-error";
            const mockUserId = "test-user";

            ec2Mock.on(CreateImageCommand).rejects({
                name: "InvalidInstanceID.NotFound",
                message: "Instance not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId)).rejects.toThrow();
        });
    });

    describe("getInstance", () => {
        it("should successfully retrieve instance details", async () => {
            const mockInstanceId = "i-get-test";
            const mockInstance = createMockInstance({ InstanceId: mockInstanceId });

            ec2Mock.on(DescribeInstancesCommand).resolves({
                Reservations: [
                    {
                        Instances: [mockInstance],
                    },
                ],
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.getInstance(mockInstanceId);

            expect(result.InstanceId).toBe(mockInstanceId);
            expect(result.State?.Name).toBe("pending");

            const calls = ec2Mock.commandCalls(DescribeInstancesCommand);
            expect(calls).toHaveLength(1);
            expect(calls[0].args[0].input.InstanceIds).toContain(mockInstanceId);
        });

        it("should throw error when getInstance fails", async () => {
            const mockInstanceId = "i-not-found";

            ec2Mock.on(DescribeInstancesCommand).rejects({
                name: "InvalidInstanceID.NotFound",
                message: "Instance not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.getInstance(mockInstanceId)).rejects.toThrow();
        });
    });

    describe("modifyInstanceTag", () => {
        it("should successfully modify instance tag", async () => {
            const mockInstanceId = "i-tag-test";
            const mockKey = "dcvConfigured";
            const mockValue = "true";

            ec2Mock.on(CreateTagsCommand).resolves({});

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.modifyInstanceTag(mockInstanceId, mockKey, mockValue);

            const calls = ec2Mock.commandCalls(CreateTagsCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;

            expect(input.Resources).toContain(mockInstanceId);
            expect(input.Tags).toHaveLength(1);
            expect(input.Tags?.[0].Key).toBe(mockKey);
            expect(input.Tags?.[0].Value).toBe(mockValue);
        });

        it("should throw error when modifyInstanceTag fails", async () => {
            const mockInstanceId = "i-tag-error";
            const mockKey = "test-key";
            const mockValue = "test-value";

            ec2Mock.on(CreateTagsCommand).rejects({
                name: "InvalidInstanceID.NotFound",
                message: "Instance not found",
                $metadata: { httpStatusCode: 400 },
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(
                ec2Wrapper.modifyInstanceTag(mockInstanceId, mockKey, mockValue),
            ).rejects.toThrow();
        });
    });
    describe("EC2Wrapper Termination Functions", () => {
        const mockInstanceId = "i-terminate-test";

        const createMockInstance = (state: InstanceStateName) => ({
            InstanceId: mockInstanceId,
            State: { Name: state },
            BlockDeviceMappings: [],
            PublicIpAddress: "1.2.3.4",
            PrivateIpAddress: "10.0.0.1",
        });

        beforeEach(() => {
            resetAllMocks();
            jest.clearAllMocks();
        });

        describe("getInstanceDetails", () => {
            it("should return instance details successfully", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("running")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                const details = await ec2Wrapper.getInstanceDetails(mockInstanceId);

                expect(details.instanceId).toBe(mockInstanceId);
                expect(details.state).toBe("running");
                expect(details.publicIp).toBe("1.2.3.4");
            });

            it("should throw INSTANCE_NOT_FOUND if instance does not exist", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [] });

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.getInstanceDetails(mockInstanceId)).rejects.toThrow(
                    `${ErrorMessages.INSTANCE_NOT_FOUND}: ${mockInstanceId}`,
                );
            });
        });

        describe("canTerminate", () => {
            it("should throw an error if the instance is in pending state", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("pending")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.canTerminate(mockInstanceId)).rejects.toThrow(
                    "Instance is in a pending state and cannot be terminated yet",
                );
            });

            it("should handle stopping state and wait for the instance to stop", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("stopping")] }],
                });

                // Mock the handleStoppingState to resolve successfully
                jest.spyOn(EC2Wrapper.prototype, "handleStoppingState").mockResolvedValue(true);

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.canTerminate(mockInstanceId);

                expect(result).toBe(true);
                expect(ec2Wrapper.handleStoppingState).toHaveBeenCalledWith(mockInstanceId);
            });

            it("should return false if the instance is already in shutting-down state", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("shutting-down")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.canTerminate(mockInstanceId);

                expect(result).toBe(false); // The instance is already shutting down
            });

            it("should return true if the instance is in running or stopped state", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("running")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.canTerminate(mockInstanceId);

                expect(result).toBe(true); // It's safe to terminate if the instance is running

                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("stopped")] }],
                });

                const resultStopped = await ec2Wrapper.canTerminate(mockInstanceId);
                expect(resultStopped).toBe(true); // It's safe to terminate if the instance is stopped
            });

            it("should return false if the instance is not found", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [] });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.canTerminate(mockInstanceId);

                expect(result).toBe(false); // Instance not found is treated as terminated
            });
        });

        describe("handleStoppingState", () => {
            it("should return true if the instance successfully stops", async () => {
                // Mock the waitUntilInstanceStopped to resolve successfully
                (waitUntilInstanceStopped as jest.Mock).mockResolvedValueOnce({ state: "SUCCESS" });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.handleStoppingState(mockInstanceId);

                expect(result).toBe(true); // Instance stopped successfully
                expect(waitUntilInstanceStopped).toHaveBeenCalledWith(
                    expect.objectContaining({ maxWaitTime: 300 }),
                    expect.objectContaining({ InstanceIds: [mockInstanceId] }),
                );
            });

            it("should throw an error if the instance fails to stop", async () => {
                // Mock the waitUntilInstanceStopped to reject with an error
                (waitUntilInstanceStopped as jest.Mock).mockRejectedValueOnce(
                    new Error("Timeout waiting for stop"),
                );

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.handleStoppingState(mockInstanceId)).rejects.toThrow(
                    "Timeout or error waiting for instance i-terminate-test to stop.",
                );
            });
        });

        describe("terminateInstance", () => {
            it("should terminate a running instance", async () => {
                // Mocking DescribeInstancesCommand to return a running instance
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("running")] }],
                });

                // Mock TerminateInstancesCommand to simulate successful termination
                ec2Mock.on(TerminateInstancesCommand).resolves({
                    TerminatingInstances: [
                        { InstanceId: mockInstanceId, CurrentState: { Name: "shutting-down" } },
                    ],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.terminateInstance(mockInstanceId);

                expect(result.instanceId).toBe(mockInstanceId);
                expect(result.state).toBe("shutting-down");
                expect(result.wasAlreadyTerminated).toBe(false);
            });

            it("should return already terminated if instance is terminated", async () => {
                // Mocking DescribeInstancesCommand to return a terminated instance
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("terminated")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.terminateInstance(mockInstanceId);

                expect(result.state).toBe("terminated");
                expect(result.wasAlreadyTerminated).toBe(true);
            });

            it("should throw error if termination fails", async () => {
                // Mocking DescribeInstancesCommand to return a running instance
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("running")] }],
                });

                // Mock TerminateInstancesCommand to simulate failure
                ec2Mock
                    .on(TerminateInstancesCommand)
                    .rejects(new Error("Failed to terminate the instance"));

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.terminateInstance(mockInstanceId)).rejects.toThrow(
                    "Failed to terminate the instance",
                );
            });
        });

        describe("waitForTermination", () => {
            it("should wait until termination and return terminated state", async () => {
                (waitUntilInstanceTerminated as jest.Mock).mockResolvedValueOnce({
                    state: "SUCCESS",
                });
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createMockInstance("terminated")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.waitForTermination(mockInstanceId);

                expect(result.state).toBe("terminated");
                expect(result.instanceId).toBe(mockInstanceId);
                expect(result.wasAlreadyTerminated).toBe(false);
            });

            it("should treat INSTANCE_NOT_FOUND as terminated", async () => {
                (waitUntilInstanceTerminated as jest.Mock).mockRejectedValueOnce(
                    new Error(`${ErrorMessages.INSTANCE_NOT_FOUND}: ${mockInstanceId}`),
                );

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.waitForTermination(mockInstanceId);

                expect(result.state).toBe("terminated");
                expect(result.wasAlreadyTerminated).toBe(false);
            });
        });

        describe("terminateAndWait", () => {
            it("should terminate instance and wait for termination", async () => {
                jest.spyOn(EC2Wrapper.prototype, "terminateInstance").mockResolvedValue({
                    instanceId: mockInstanceId,
                    state: "shutting-down",
                    wasAlreadyTerminated: false,
                });
                jest.spyOn(EC2Wrapper.prototype, "waitForTermination").mockResolvedValue({
                    instanceId: mockInstanceId,
                    state: "terminated",
                    wasAlreadyTerminated: false,
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.terminateAndWait(mockInstanceId);

                expect(result.state).toBe("terminated");
                expect(result.instanceId).toBe(mockInstanceId);
                expect(result.wasAlreadyTerminated).toBe(false);
            });

            it("should return immediately if instance already terminated", async () => {
                jest.spyOn(EC2Wrapper.prototype, "terminateInstance").mockResolvedValue({
                    instanceId: mockInstanceId,
                    state: "terminated",
                    wasAlreadyTerminated: true,
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.terminateAndWait(mockInstanceId);

                expect(result.wasAlreadyTerminated).toBe(true); // instance already terminated
                expect(result.state).toBe("terminated");
            });
        });
    });

    describe("resumeAndStartInstance", () => {
        const RESUME_INSTANCE_ID = "i-resume-test123";

        beforeEach(() => {
            resetAllMocks();
            jest.clearAllMocks();
        });

        // ── Success — CurrentState.Name present ───────────────────────────────

        it("returns instanceId and the CurrentState.Name on success", async () => {
            ec2Mock.on(StartInstancesCommand).resolves({
                StartingInstances: [
                    { InstanceId: RESUME_INSTANCE_ID, CurrentState: { Name: "running" } },
                ],
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID);

            expect(result).toEqual({ instanceId: RESUME_INSTANCE_ID, status: "running" });
        });

        it("returns status 'pending' when CurrentState.Name is 'pending'", async () => {
            ec2Mock.on(StartInstancesCommand).resolves({
                StartingInstances: [
                    { InstanceId: RESUME_INSTANCE_ID, CurrentState: { Name: "pending" } },
                ],
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID);

            expect(result.status).toBe("pending");
        });

        // ── Default status when StartingInstances is empty / undefined ────────

        it("defaults status to 'pending' when StartingInstances is an empty array", async () => {
            ec2Mock.on(StartInstancesCommand).resolves({
                StartingInstances: [],
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID);

            expect(result).toEqual({ instanceId: RESUME_INSTANCE_ID, status: "pending" });
        });

        it("defaults status to 'pending' when StartingInstances is undefined", async () => {
            ec2Mock.on(StartInstancesCommand).resolves({
                StartingInstances: undefined,
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID);

            expect(result).toEqual({ instanceId: RESUME_INSTANCE_ID, status: "pending" });
        });

        it("defaults status to 'pending' when CurrentState is undefined on the first entry", async () => {
            ec2Mock.on(StartInstancesCommand).resolves({
                StartingInstances: [{ InstanceId: RESUME_INSTANCE_ID, CurrentState: undefined }],
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID);

            expect(result.status).toBe("pending");
        });

        // ── StartInstancesCommand input ───────────────────────────────────────

        it("sends StartInstancesCommand with the correct InstanceIds", async () => {
            ec2Mock.on(StartInstancesCommand).resolves({
                StartingInstances: [
                    { InstanceId: RESUME_INSTANCE_ID, CurrentState: { Name: "running" } },
                ],
            });

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID);

            const calls = ec2Mock.commandCalls(StartInstancesCommand);
            expect(calls).toHaveLength(1);
            expect(calls[0].args[0].input.InstanceIds).toEqual([RESUME_INSTANCE_ID]);
        });

        // ── Error wrapping ────────────────────────────────────────────────────

        it("wraps EC2 errors with 'Failed to start instance <id>: <message>'", async () => {
            ec2Mock.on(StartInstancesCommand).rejects(new Error("insufficient capacity"));

            const ec2Wrapper = new EC2Wrapper();
            await expect(ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID)).rejects.toThrow(
                `Failed to start instance ${RESUME_INSTANCE_ID}: insufficient capacity`,
            );
        });

        it("wraps non-Error thrown values (string) into the error message", async () => {
            ec2Mock.on(StartInstancesCommand).rejects("raw-string-error");

            const ec2Wrapper = new EC2Wrapper();
            await expect(ec2Wrapper.resumeAndStartInstance(RESUME_INSTANCE_ID)).rejects.toThrow(
                `Failed to start instance ${RESUME_INSTANCE_ID}:`,
            );
        });
    });

    describe("EC2Wrapper Stop Functions", () => {
        const mockInstanceId = "i-stop-test";

        const createStopMockInstance = (state: InstanceStateName) => ({
            InstanceId: mockInstanceId,
            State: { Name: state },
            BlockDeviceMappings: [],
            PublicIpAddress: "1.2.3.4",
            PrivateIpAddress: "10.0.0.1",
        });

        beforeEach(() => {
            resetAllMocks();
            jest.clearAllMocks();
        });

        // ── canStop ───────────────────────────────────────────────────────────

        describe("canStop", () => {
            it("returns true when instance state is 'running'", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("running")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.canStop(mockInstanceId)).resolves.toBe(true);
            });

            it.each(["pending", "stopping"] as InstanceStateName[])(
                "returns false for transitional state '%s'",
                async (state) => {
                    ec2Mock.on(DescribeInstancesCommand).resolves({
                        Reservations: [{ Instances: [createStopMockInstance(state)] }],
                    });

                    const ec2Wrapper = new EC2Wrapper();
                    await expect(ec2Wrapper.canStop(mockInstanceId)).resolves.toBe(false);
                },
            );

            it.each(["shutting-down", "terminated", "stopped"] as InstanceStateName[])(
                "returns false for terminal/idle state '%s'",
                async (state) => {
                    ec2Mock.on(DescribeInstancesCommand).resolves({
                        Reservations: [{ Instances: [createStopMockInstance(state)] }],
                    });

                    const ec2Wrapper = new EC2Wrapper();
                    await expect(ec2Wrapper.canStop(mockInstanceId)).resolves.toBe(false);
                },
            );

            it("throws when the instance is in an unknown state", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [
                        {
                            Instances: [
                                {
                                    ...createStopMockInstance("running"),
                                    State: { Name: "mystery-state" as InstanceStateName },
                                },
                            ],
                        },
                    ],
                });

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.canStop(mockInstanceId)).rejects.toThrow(
                    "Unknown or unsupported instance state: mystery-state",
                );
            });

            it("returns false when the instance does not exist (treats INSTANCE_NOT_FOUND as stopped)", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [] });

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.canStop(mockInstanceId)).resolves.toBe(false);
            });

            it("rethrows errors unrelated to INSTANCE_NOT_FOUND", async () => {
                ec2Mock.on(DescribeInstancesCommand).rejects(new Error("some-network-error"));

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.canStop(mockInstanceId)).rejects.toThrow(
                    "some-network-error",
                );
            });
        });

        // ── stopEC2Instance ───────────────────────────────────────────────────

        describe("stopEC2Instance", () => {
            it("returns { instanceId, status: 'stopped' } without calling StopInstancesCommand when canStop is false", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("stopped")] }],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.stopEC2Instance(mockInstanceId);

                expect(result).toEqual({ instanceId: mockInstanceId, status: "stopped" });
                expect(ec2Mock.commandCalls(StopInstancesCommand)).toHaveLength(0);
            });

            it("calls StopInstancesCommand with the correct InstanceIds when the instance is running", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("running")] }],
                });
                ec2Mock.on(StopInstancesCommand).resolves({
                    StoppingInstances: [
                        { InstanceId: mockInstanceId, CurrentState: { Name: "stopping" } },
                    ],
                });

                const ec2Wrapper = new EC2Wrapper();
                await ec2Wrapper.stopEC2Instance(mockInstanceId);

                const calls = ec2Mock.commandCalls(StopInstancesCommand);
                expect(calls).toHaveLength(1);
                expect(calls[0].args[0].input).toMatchObject({ InstanceIds: [mockInstanceId] });
            });

            it("returns the instanceId and status from the StopInstances response", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("running")] }],
                });
                ec2Mock.on(StopInstancesCommand).resolves({
                    StoppingInstances: [
                        { InstanceId: mockInstanceId, CurrentState: { Name: "stopping" } },
                    ],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.stopEC2Instance(mockInstanceId);

                expect(result).toEqual({ instanceId: mockInstanceId, status: "stopping" });
            });

            it("falls back to the input instanceId when InstanceId is absent from the response", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("running")] }],
                });
                ec2Mock.on(StopInstancesCommand).resolves({
                    StoppingInstances: [
                        { InstanceId: undefined, CurrentState: { Name: "stopping" } },
                    ],
                });

                const ec2Wrapper = new EC2Wrapper();
                const result = await ec2Wrapper.stopEC2Instance(mockInstanceId);

                expect(result.instanceId).toBe(mockInstanceId);
            });

            it("throws STOP_FAILED when StoppingInstances is undefined in the response", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("running")] }],
                });
                ec2Mock.on(StopInstancesCommand).resolves({ StoppingInstances: undefined });

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.stopEC2Instance(mockInstanceId)).rejects.toThrow(
                    ErrorMessages.STOP_FAILED,
                );
            });

            it("throws STOP_FAILED when StoppingInstances is an empty array", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("running")] }],
                });
                ec2Mock.on(StopInstancesCommand).resolves({ StoppingInstances: [] });

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.stopEC2Instance(mockInstanceId)).rejects.toThrow(
                    ErrorMessages.STOP_FAILED,
                );
            });

            it("propagates errors thrown by StopInstancesCommand", async () => {
                ec2Mock.on(DescribeInstancesCommand).resolves({
                    Reservations: [{ Instances: [createStopMockInstance("running")] }],
                });
                ec2Mock.on(StopInstancesCommand).rejects(new Error("aws-stop-error"));

                const ec2Wrapper = new EC2Wrapper();
                await expect(ec2Wrapper.stopEC2Instance(mockInstanceId)).rejects.toThrow(
                    "aws-stop-error",
                );
            });
        });
    });
});
