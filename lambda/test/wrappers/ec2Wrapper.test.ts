import {
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning
} from '@aws-sdk/client-ec2';
import EC2Wrapper, { EC2InstanceConfig } from '../../src/utils/ec2Wrapper';
import { ec2Mock, resetAllMocks, mockResponses } from '../__mocks__/aws-mocks';

jest.mock('@aws-sdk/client-ec2', () => {
    const actual = jest.requireActual('@aws-sdk/client-ec2');
    return {
        ...actual,
        waitUntilInstanceRunning: jest.fn(),
    };
});

describe('EC2Wrapper', () => {
    const createMockInstance = (overrides = {}) => ({
        InstanceId: 'i-1234567890abcdef0',
        State: { Name: 'pending' as const },
        InstanceType: 't3.micro' as const,
        Placement: { AvailabilityZone: 'us-east-1a' },
        BlockDeviceMappings: [],
        PublicIpAddress: '1.2.3.4',
        PrivateIpAddress: '10.0.0.1',
        LaunchTime: new Date(),
        ...overrides
    });

    const mockEC2Success = (instanceId = 'i-test123', overrides = {}) => {
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [createMockInstance({ InstanceId: instanceId, ...overrides })]
        });
    };

    const mockDescribeInstancesSuccess = (instanceId = 'i-test123', overrides = {}) => {
        ec2Mock.on(DescribeInstancesCommand).resolves({
            Reservations: [{
                Instances: [createMockInstance({
                    InstanceId: instanceId,
                    State: { Name: 'running' },
                    ...overrides
                })]
            }]
        });
    };

    const mockEC2Failure = (errorName: string, errorMessage: string) => {
        ec2Mock.on(RunInstancesCommand).rejects({
            name: errorName,
            message: errorMessage,
            $metadata: { httpStatusCode: 400 }
        });
    };

    const mockWaiterSuccess = () => {
        (waitUntilInstanceRunning as jest.Mock).mockResolvedValueOnce({
            state: 'SUCCESS'
        });
    };

    const mockWaiterTimeout = () => {
        (waitUntilInstanceRunning as jest.Mock).mockRejectedValueOnce({
            name: 'WaiterTimedOut',
            message: 'Waiter timed out'
        });
    };

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
    });

    describe('createInstance', () => {

        it('should successfully create an EC2 instance with required fields', async () => {
            const mockInstanceId = 'i-1234567890abcdef0';
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user-123',
                instanceType: 't3.medium',
            };

            mockEC2Success(mockInstanceId);

            const ec2Wrapper = new EC2Wrapper('us-east-1');
            const result = await ec2Wrapper.createInstance(mockConfig);

            expect(result.instanceId).toBe(mockInstanceId);
            expect(result.state).toBe('pending');
            expect(result.instanceArn).toBeDefined();
            expect(result.instanceArn).toContain(mockInstanceId);
            expect(result.instanceArn).toContain('us-east-1');
            expect(result.createdAt).toBeDefined();
        });

        it('should include optional fields when provided', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user-123',
                instanceType: 'g4dn.xlarge',
                keyName: 'my-keypair',
                securityGroupIds: ['sg-12345'],
                subnetId: 'subnet-12345',
            };

            mockEC2Success();

            const ec2Wrapper = new EC2Wrapper('us-east-1');
            await ec2Wrapper.createInstance(mockConfig);

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            expect(calls).toHaveLength(1);

            const input = calls[0].args[0].input;
            expect(input.InstanceType).toBe('g4dn.xlarge');
            expect(input.KeyName).toBe('my-keypair');
            expect(input.SecurityGroupIds).toContain('sg-12345');
            expect(input.SubnetId).toBe('subnet-12345');

        });

        it('should apply correct tags to the instance', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user-456',
                instanceType: 't3.medium',
                tags: {
                    Environment: 'test',
                    Project: 'lunaris'
                }
            };

            mockEC2Success();

            const ec2Wrapper = new EC2Wrapper('us-east-1');
            await ec2Wrapper.createInstance(mockConfig);

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            const tags = calls[0].args[0].input.TagSpecifications?.[0].Tags;

            expect(tags).toBeDefined();
            const userIdTag = tags?.find((t: any) => t.Key === 'userId');
            expect(userIdTag?.Value).toBe('test-user-456');

            const managedByTag = tags?.find((t: any) => t.Key === 'managed-by');
            expect(managedByTag?.Value).toBe('lunaris');

            const purposeTag = tags?.find((t: any) => t.Key === 'purpose');
            expect(purposeTag?.Value).toBe('cloud-gaming');

            const environmentTag = tags?.find((t: any) => t.Key === 'Environment');
            expect(environmentTag).toBeDefined();
            expect(environmentTag?.Value).toBe('test');

            const projectTag = tags?.find((t: any) => t.Key === 'Project');
            expect(projectTag).toBeDefined();
            expect(projectTag?.Value).toBe('lunaris');
        });

        it('should use BasicDCV launch template', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
            };

            mockEC2Success();

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.createInstance(mockConfig);

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            const input = calls[0].args[0].input;

            expect(input.LaunchTemplate).toBeDefined();
            expect(input.LaunchTemplate?.LaunchTemplateName).toBe('BasicDCV');
        });
    });

    describe('createInstance - error handling', () => {

        interface ErrorTestCase {
            name: string;
            errorName: string;
            errorMessage: string;
            expectedErrorContains: string;
            config?: Partial<EC2InstanceConfig>;
        }

        const errorTestCases: ErrorTestCase[] = [
            {
                name: 'instance limit exceeded',
                errorName: 'InstanceLimitExceeded',
                errorMessage: 'You have requested more instances than your current limit',
                expectedErrorContains: 'Cannot create instance'
            },
            {
                name: 'subnet not found',
                errorName: 'InvalidSubnetID.NotFound',
                errorMessage: 'The subnet does not exist',
                expectedErrorContains: 'Subnet ID',
                config: { subnetId: 'subnet-nonexistent' }
            },
            {
                name: 'security group not found',
                errorName: 'InvalidGroup.NotFound',
                errorMessage: 'The security group does not exist',
                expectedErrorContains: 'security groups not found'
            },
            {
                name: 'key pair not found',
                errorName: 'InvalidKeyPair.NotFound',
                errorMessage: 'The key pair does not exist',
                expectedErrorContains: 'Key pair',
                config: { keyName: 'my-key' }
            },
            {
                name: 'unknown error',
                errorName: 'SomeUnknownError',
                errorMessage: 'An unknown error occurred',
                expectedErrorContains: 'Failed to create EC2 instance'
            }
        ];

        errorTestCases.forEach(({ name, errorName, errorMessage, expectedErrorContains, config }) => {
            it(`should throw error when ${name}`, async () => {
                const mockConfig: EC2InstanceConfig = {
                    userId: 'test-user',
                    instanceType: 't3.medium',
                    ...config
                };

                mockEC2Failure(errorName, errorMessage);

                const ec2Wrapper = new EC2Wrapper();

                await expect(ec2Wrapper.createInstance(mockConfig))
                    .rejects
                    .toThrow(expectedErrorContains);
            });
        });
    });

    describe('waitForInstanceRunning', () => {

        it('should wait for instance and return running state', async () => {
            const mockInstanceId = 'i-1234567890abcdef0';

            mockWaiterSuccess();
            mockDescribeInstancesSuccess(mockInstanceId, {
                PublicIpAddress: '1.2.3.4',
                PrivateIpAddress: '10.0.0.1'
            });

            const ec2Wrapper = new EC2Wrapper('us-west-2');
            const result = await ec2Wrapper.waitForInstanceRunning(mockInstanceId);

            expect(result.state).toBe('running');
            expect(result.instanceId).toBe(mockInstanceId);
            expect(result.publicIp).toBe('1.2.3.4');
            expect(result.privateIp).toBe('10.0.0.1');
            expect(result.instanceArn).toContain('us-west-2');

            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });

        it('should throw error when wait timeout is exceeded', async () => {
            const mockInstanceId = 'i-slow-instance';

            mockWaiterTimeout();


            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.waitForInstanceRunning(mockInstanceId))
                .rejects.toThrow(`Timeout waiting for instance ${mockInstanceId} to reach running state`);

        });
    });

    describe('createAndWaitForInstance', () => {

        it('should create instance and wait when waitForRunning is true', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user-789',
                instanceType: 't3.medium',
            };

            const mockInstanceId = 'i-test-wait';

            mockEC2Success(mockInstanceId, { State: { Name: 'pending' } });

            mockWaiterSuccess();

            mockDescribeInstancesSuccess(mockInstanceId);

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.createAndWaitForInstance(mockConfig, true);

            expect(result.state).toBe('running');
            expect(result.instanceId).toBe(mockInstanceId);

            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });

    });

    describe('constructor and region handling', () => {

        const regionTestCases = [
            {
                name: 'should use provided region',
                region: 'eu-west-1',
                envVar: undefined,
                expectedRegion: 'eu-west-1'
            },
            {
                name: 'should fall back to CDK_DEFAULT_REGION env var',
                region: undefined,
                envVar: 'ap-southeast-2',
                expectedRegion: 'ap-southeast-2'
            },
            {
                name: 'should default to us-east-1 when no region specified',
                region: undefined,
                envVar: undefined,
                expectedRegion: 'us-east-1'
            }
        ];

        regionTestCases.forEach(({ name, region, envVar, expectedRegion }) => {
            it(name, async () => {
                const originalEnv = process.env.CDK_DEFAULT_REGION;
                if (envVar !== undefined) {
                    process.env.CDK_DEFAULT_REGION = envVar;
                } else {
                    delete process.env.CDK_DEFAULT_REGION;
                }

                mockEC2Success('i-test-region');

                const ec2Wrapper = region ? new EC2Wrapper(region) : new EC2Wrapper();
                const result = await ec2Wrapper.createInstance({ userId: 'test' });

                expect(result.instanceArn).toContain(expectedRegion);

                if (originalEnv !== undefined) {
                    process.env.CDK_DEFAULT_REGION = originalEnv;
                }
            });
        });
    });
});