import {
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning
} from '@aws-sdk/client-ec2';
import EC2Wrapper, { EC2InstanceConfig } from '../../src/utils/ec2Wrapper';
import { ec2Mock, resetAllMocks } from '../__mocks__/aws-mocks';

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

    const mockWaiterSuccess = () => {
        (waitUntilInstanceRunning as jest.Mock).mockResolvedValueOnce({
            state: 'SUCCESS'
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

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
    });

    describe('createInstance', () => {
        it('should create EC2 instance with all required fields', async () => {
            const mockInstanceId = 'i-test123';
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user-123',
                instanceType: 't3.medium',
            };

            mockEC2Success(mockInstanceId);

            const ec2Wrapper = new EC2Wrapper('us-east-1');
            const result = await ec2Wrapper.createInstance(mockConfig);

            expect(result.instanceId).toBe(mockInstanceId);
            expect(result.state).toBe('pending');
            expect(result.instanceArn).toContain(mockInstanceId);
            expect(result.instanceArn).toContain('us-east-1');
            expect(result.createdAt).toBeDefined();
            expect(result.publicIp).toBe('1.2.3.4');
            expect(result.privateIp).toBe('10.0.0.1');

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;
            expect(input.InstanceType).toBe('t3.medium');
            expect(input.MinCount).toBe(1);
            expect(input.MaxCount).toBe(1);

            const tags = input.TagSpecifications?.[0].Tags;
            const userIdTag = tags?.find((t: any) => t.Key === 'userId');
            expect(userIdTag?.Value).toBe('test-user-123');
        });

        it('should use BasicDCV launch template', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            mockEC2Success();

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.createInstance(mockConfig);

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            const input = calls[0].args[0].input;
            expect(input.LaunchTemplate?.LaunchTemplateName).toBe('BasicDCV');
        });

        it('should throw error when instance limit exceeded', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: 'InstanceLimitExceeded',
                message: 'You have exceeded your instance limit',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig))
                .rejects
                .toThrow('Cannot create instance: Account instance limit exceeded');
        });

        it('should throw error when userId is empty', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: '',
                instanceType: 't3.micro',
            };

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig))
                .rejects
                .toThrow('userId is required and cannot be empty');
        });
    });

    describe('waitForInstanceRunning', () => {
        it('should wait for instance and return running state', async () => {
            mockWaiterSuccess();
            mockDescribeInstancesSuccess('i-wait-test');

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.waitForInstanceRunning('i-wait-test');

            expect(result.state).toBe('running');
            expect(result.instanceId).toBe('i-wait-test');
            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });
    });

    describe('createAndWaitForInstance', () => {
        it('should create and wait for instance successfully', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            mockEC2Success('i-create-wait');
            mockWaiterSuccess();
            mockDescribeInstancesSuccess('i-create-wait');

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.createAndWaitForInstance(mockConfig);

            expect(result.state).toBe('running');
            expect(result.instanceId).toBe('i-create-wait');
            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });
    });
});
