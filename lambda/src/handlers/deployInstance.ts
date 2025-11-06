import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfnClient = new SFNClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const RUNNING_INSTANCES_TABLE = process.env.RUNNING_INSTANCES_TABLE || '';
const STEP_FUNCTION_ARN = process.env.USER_DEPLOY_EC2_WORKFLOW_ARN || ''; 

interface DeployInstanceRequest {
    userId: string;
    instanceType?: string;
    amiId?: string;
}

export const handler = async (event: APIGatewayProxyEvent, context: any): Promise<APIGatewayProxyResult> => {
    try {
        const body: DeployInstanceRequest = JSON.parse(event.body || '{}');
        const { userId, instanceType = 't3.micro', amiId } = body;

        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'User ID is required' })
            };
        }

        if (!amiId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'AMI ID is required' })
            };
        }

        // Start the UserDeployEC2 Step Function
        if (!STEP_FUNCTION_ARN) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'UserDeployEC2 Step Function ARN is not set' })
            };
        }
        
        const stepFunctionInput = {
            userId: userId,
            instanceType: instanceType,
            amiId: amiId
        }

        const executionName = `${userId}-${Date.now()}`;

        const startExecutionCommand = new StartExecutionCommand({
            stateMachineArn: STEP_FUNCTION_ARN,
            input: JSON.stringify(stepFunctionInput),
            name: executionName
        });

        const executionResponse = await sfnClient.send(startExecutionCommand);

        if (!executionResponse.executionArn) {
            throw new Error('Failed to start UserDeployEC2 Step Function');
        }

        const now = new Date().toISOString();

        // Log to RunningInstances table
        const putCommand = new PutCommand({
            TableName: RUNNING_INSTANCES_TABLE,
            Item: {
                userId: userId,
                executionArn: executionResponse.executionArn,
                status: 'RUNNING',
                createdAt: now,
                instanceType: instanceType,
                amiId: amiId
            }
        });

        await docClient.send(putCommand);

        console.log(`Started Step Function execution ${executionResponse.executionArn} for user ${userId}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: 'success',
                message: 'Deployment workflow started successfully',
                statusCode: 200
            })
        };

    } catch (error) {
        console.error('Error deploying instance:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to deploy instance',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};