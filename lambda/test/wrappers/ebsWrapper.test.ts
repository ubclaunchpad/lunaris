import EBSWrapper, { CreateVolumeCommandConfig, EBSStatusEnum } from "../../src/utils/ebsWrapper";
import { ec2Mock, dynamoDBMock, resetAllMocks } from '../__mocks__/aws-mocks';
import {
    CreateVolumeCommand,
    AttachVolumeCommand,
    DescribeVolumesCommand,
    ModifyInstanceAttributeCommand,
    type CreateVolumeCommandOutput,
    type AttachVolumeCommandOutput,
    type DescribeVolumesCommandOutput
} from "@aws-sdk/client-ec2";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

describe("EBSWrapper", () => {
    let ebsWrapper: EBSWrapper;

    const mockVolumeId = 'vol-1234567890abcdef0';
    const mockInstanceId = 'i-1234567890abcdef0';
    const mockUserId = 'test-user-123';

    // mock responses:
    const createMockVolume = (overrides: Partial<CreateVolumeCommandOutput> = {}): CreateVolumeCommandOutput => ({
        VolumeId: mockVolumeId,
        State: 'creating',
        Size: 100,
        VolumeType: 'gp3',
        AvailabilityZone: 'us-east-1a',
        CreateTime: new Date('2024-01-01T00:00:00Z'),
        Attachments: [],
        Tags: [],
        Encrypted: false,
        Iops: 3000,
        SnapshotId: '',
        $metadata: {
            httpStatusCode: 200,
            requestId: 'test-request-id',
            attempts: 1,
            totalRetryDelay: 0
        },
        ...overrides
    });

    const createMockAttachment = (overrides: Partial<AttachVolumeCommandOutput> = {}): AttachVolumeCommandOutput => ({
        VolumeId: mockVolumeId,
        InstanceId: mockInstanceId,
        Device: '/dev/sdf',
        State: 'attaching',
        AttachTime: new Date(),
        $metadata: {
            httpStatusCode: 200,
            requestId: 'test-request-id',
            attempts: 1,
            totalRetryDelay: 0
        },
        ...overrides
    });

    const createMockDescribeVolumes = (state: EBSStatusEnum): DescribeVolumesCommandOutput => ({
        Volumes: [{
            VolumeId: mockVolumeId,
            State: state,
            Size: 100,
            VolumeType: 'gp3',
            AvailabilityZone: 'us-east-1a',
            CreateTime: new Date(),
            Attachments: [],
            Tags: [],
            Encrypted: false,
            Iops: 3000
        }],
        $metadata: {
            httpStatusCode: 200,
            requestId: 'test-request-id',
            attempts: 1,
            totalRetryDelay: 0
        }
    });

    const mockCreateVolumeSuccess = (volumeId = mockVolumeId, state: EBSStatusEnum = EBSStatusEnum.CREATING) => {
        ec2Mock.on(CreateVolumeCommand).resolves(
            createMockVolume({ VolumeId: volumeId, State: state })
        );
    };

    const mockDescribeVolumesSuccess = (volumeId = mockVolumeId, state: EBSStatusEnum) => {
        ec2Mock.on(DescribeVolumesCommand).resolves(
            createMockDescribeVolumes(state)
        );
    };

    const mockAttachVolumeSuccess = (volumeId = mockVolumeId, instanceId = mockInstanceId) => {
        ec2Mock.on(AttachVolumeCommand).resolves(
            createMockAttachment({ VolumeId: volumeId, InstanceId: instanceId })
        );
    };

    const mockModifyInstanceSuccess = () => {
        ec2Mock.on(ModifyInstanceAttributeCommand).resolves({
            $metadata: {
                httpStatusCode: 200,
                requestId: 'test-request-id',
                attempts: 1,
                totalRetryDelay: 0
            }
        });
    };

    const mockDynamoQuerySuccess = (hasExistingInstance = false) => {
        dynamoDBMock.on(QueryCommand).resolves({
            Items: hasExistingInstance ? [{
                instanceId: mockInstanceId,
                userId: mockUserId,
                status: 'running'
            }] : [],
            $metadata: {
                httpStatusCode: 200,
                requestId: 'test-request-id',
                attempts: 1,
                totalRetryDelay: 0
            }
        });
    };

    const mockDynamoPutSuccess = () => {
        dynamoDBMock.on(PutCommand).resolves({
            $metadata: {
                httpStatusCode: 200,
                requestId: 'test-request-id',
                attempts: 1,
                totalRetryDelay: 0
            }
        });
    };

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
        ebsWrapper = new EBSWrapper('us-east-1', 100, 'RunningInstancesTable');
    });

    describe('createEBSVolume', () => {
        it('should create EBS volume with correct parameters', async () => {
            mockCreateVolumeSuccess();

            const config: CreateVolumeCommandConfig = {
                userId: mockUserId,
                size: 100,
                volumeType: 'gp3',
                tags: { environment: 'test' }
            };

            const result = await ebsWrapper.createEBSVolume(config);

            expect(result.VolumeId).toBe(mockVolumeId);
            expect(result.State).toBe('creating');

            const calls = ec2Mock.commandCalls(CreateVolumeCommand);
            expect(calls).toHaveLength(1);

            const input = calls[0].args[0].input;
            expect(input.Size).toBe(100);
            expect(input.VolumeType).toBe('gp3');
        });

        it('should handle InsufficientVolumeCapacity error', async () => {
            const error = new Error('Insufficient capacity');
            error.name = 'InsufficientVolumeCapacity';
            ec2Mock.on(CreateVolumeCommand).rejects(error);

            const config: CreateVolumeCommandConfig = {
                userId: mockUserId
            };

            await expect(ebsWrapper.createEBSVolume(config))
                .rejects
                .toThrow('Cannot create volume: There is not enough capacity');
        });
    });

    describe('waitForEBSVolume', () => {
        it('should wait until volume becomes available', async () => {
            mockDescribeVolumesSuccess(mockVolumeId, EBSStatusEnum.AVAILABLE);

            const result = await ebsWrapper.waitForEBSVolume(
                mockVolumeId,
                300,
                EBSStatusEnum.AVAILABLE
            );

            expect(result).toBe(EBSStatusEnum.AVAILABLE);
        });

        it('should throw error if volume not found', async () => {
            ec2Mock.on(DescribeVolumesCommand).resolves({
                Volumes: [],
                $metadata: {
                    httpStatusCode: 200,
                    requestId: 'test-request-id',
                    attempts: 1,
                    totalRetryDelay: 0
                }
            });

            await expect(
                ebsWrapper.waitForEBSVolume(mockVolumeId, 300, EBSStatusEnum.AVAILABLE)
            ).rejects.toThrow(`Volume ${mockVolumeId} not found`);
        });

        it('should throw error if volume enters error state', async () => {
            mockDescribeVolumesSuccess(mockVolumeId, EBSStatusEnum.ERROR);

            await expect(
                ebsWrapper.waitForEBSVolume(mockVolumeId, 300, EBSStatusEnum.AVAILABLE)
            ).rejects.toThrow(`Volume ${mockVolumeId} entered error state`);
        });
    });

    describe('attachEBSVolume', () => {
        it('should attach volume and set DeleteOnTermination to false', async () => {
            mockAttachVolumeSuccess();
            mockModifyInstanceSuccess();

            await ebsWrapper.attachEBSVolume(mockInstanceId, mockVolumeId);

            const attachCalls = ec2Mock.commandCalls(AttachVolumeCommand);
            expect(attachCalls).toHaveLength(1);
            expect(attachCalls[0].args[0].input).toMatchObject({
                InstanceId: mockInstanceId,
                VolumeId: mockVolumeId,
                Device: '/dev/sdf'
            });

            const modifyCalls = ec2Mock.commandCalls(ModifyInstanceAttributeCommand);
            expect(modifyCalls).toHaveLength(1);
        });
    });

    describe('createAndAttachEBSVolume', () => {
        it('should create and attach volume successfully', async () => {
            mockDynamoQuerySuccess(false);
            mockCreateVolumeSuccess();

            let callCount = 0;
            ec2Mock.on(DescribeVolumesCommand).callsFake(() => {
                callCount++;
                const state = callCount <= 2 ? EBSStatusEnum.AVAILABLE : EBSStatusEnum.IN_USE;
                return Promise.resolve(createMockDescribeVolumes(state));
            });

            mockAttachVolumeSuccess();
            mockModifyInstanceSuccess();
            mockDynamoPutSuccess();

            const config: CreateVolumeCommandConfig = {
                userId: mockUserId,
                size: 100
            };

            const result = await ebsWrapper.createAndAttachEBSVolume(config, mockInstanceId);

            expect(result.volumeId).toBe(mockVolumeId);
            expect(result.status).toBe(EBSStatusEnum.IN_USE);
        });
    });
});
