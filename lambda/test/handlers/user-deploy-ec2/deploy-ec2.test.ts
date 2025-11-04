import { handler } from '../../../src/handlers/user-deploy-ec2/deploy-ec2';
import EC2Wrapper from '../../../src/utils/ec2Wrapper';

jest.mock('../../../src/utils/ec2Wrapper');

describe('deploy-ec2 Step Function handler', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();

        process.env.SECURITY_GROUP_ID = 'sg-test123';
        process.env.SUBNET_ID = 'subnet-test456';
        process.env.KEY_PAIR_NAME = 'test-keypair';
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    const mockEC2WrapperSuccess = (overrides = {}) => {
        const mockInstance = {
            instanceId: 'i-mockinstance123',
            instanceArn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-mockinstance123',
            state: 'running',
            publicIp: '54.123.45.67',
            privateIp: '10.0.1.5',
            createdAt: new Date().toISOString(),
            ...overrides
        };

        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => ({
            createAndWaitForInstance: jest.fn().mockResolvedValue(mockInstance),
            createInstance: jest.fn(),
            waitForInstanceRunning: jest.fn(),
        } as any));

        return mockInstance;
    };

    const mockEC2WrapperFailure = (errorMessage: string) => {
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => ({
            createAndWaitForInstance: jest.fn().mockRejectedValue(new Error(errorMessage)),
            createInstance: jest.fn(),
            waitForInstanceRunning: jest.fn(),
        } as any));
    };

    describe('successful deployment', () => {
        it('should create EC2 instance and return success with all fields', async () => {
            const mockInstance = mockEC2WrapperSuccess();

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.medium' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.instanceId).toBe(mockInstance.instanceId);
            expect(result.instanceArn).toBe(mockInstance.instanceArn);
            expect(result.state).toBe('running');
            expect(result.publicIp).toBe(mockInstance.publicIp);
            expect(result.privateIp).toBe(mockInstance.privateIp);
            expect(result.createdAt).toBeDefined();
            expect(result.error).toBeUndefined();

            const mockWrapper = (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mock.results[0].value;
            expect(mockWrapper.createAndWaitForInstance).toHaveBeenCalledTimes(1);

            const calledConfig = (mockWrapper.createAndWaitForInstance as jest.Mock).mock.calls[0][0];
            expect(calledConfig.userId).toBe('test-user-123');
            expect(calledConfig.instanceType).toBe('t3.medium');
            expect(calledConfig.securityGroupIds).toEqual(['sg-test123']);
            expect(calledConfig.subnetId).toBe('subnet-test456');
            expect(calledConfig.keyName).toBe('test-keypair');
        });

        it('should handle missing environment variables gracefully', async () => {
            mockEC2WrapperSuccess();

            delete process.env.SECURITY_GROUP_ID;
            delete process.env.SUBNET_ID;
            delete process.env.KEY_PAIR_NAME;

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(true);

            const mockWrapper = (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mock.results[0].value;
            const calledConfig = (mockWrapper.createAndWaitForInstance as jest.Mock).mock.calls[0][0];

            expect(calledConfig.securityGroupIds).toBeUndefined();
            expect(calledConfig.subnetId).toBeUndefined();
            expect(calledConfig.keyName).toBeUndefined();
        });
    });

    describe('error handling', () => {
        it('should return error response when instance creation fails', async () => {
            mockEC2WrapperFailure('Instance limit exceeded');

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Instance limit exceeded');
            expect(result.instanceId).toBeUndefined();
            expect(result.state).toBeUndefined();
        });
    });
});
