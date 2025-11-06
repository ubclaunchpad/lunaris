import { EC2Client, RunInstancesCommand, _InstanceType } from '@aws-sdk/client-ec2';

const ec2Client = new EC2Client({});

export const handler = async (
  event: DeployEc2Event
): Promise<DeployEc2Result> => {
  try {
    const { userId, instanceType, amiId } = event;

    if (!userId || !instanceType || !amiId) {
      throw new Error('Missing required fields: userId, instanceType, or amiId');
    }

    const runInstancesCommand = new RunInstancesCommand({
      ImageId: amiId,
      InstanceType: instanceType as _InstanceType,
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'UserId', Value: userId },
            { Key: 'ManagedBy', Value: 'Lunaris' }
          ]
        }
      ]
    });

    const response = await ec2Client.send(runInstancesCommand);
    const instance = response.Instances?.[0];

    if (!instance || !instance.InstanceId) {
      throw new Error('Failed to create EC2 instance');
    }

    const instanceArn = `arn:aws:ec2:${process.env.AWS_REGION || 'us-east-1'}:${process.env.AWS_ACCOUNT_ID || ''}:instance/${instance.InstanceId}`;

    console.log(`Successfully deployed EC2 instance ${instance.InstanceId} for user ${userId}`);

    return {
      success: true,
      instanceArn: instanceArn,
      instanceType: instance.InstanceType
    };

  } catch (error) {
    console.error('Error deploying EC2 instance:', error);
    return {
      success: false
    };
  }
};

type DeployEc2Event = {
  userId: string;
  instanceType: string;
  amiId: string;
};

type DeployEc2Result = {
  success: boolean;
  instanceArn?: string;
  instanceType?: string;
};