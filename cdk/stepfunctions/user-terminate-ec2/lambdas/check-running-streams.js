const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({});

/**
 * Lambda function to check if a user has a valid entry in RunningStreams table
 * Input: { userId: string }
 * Output: { valid: boolean, sessionId?: string, instanceArn?: string }
 */
exports.handler = async (event) => {
    console.log('CheckRunningStreams event:', JSON.stringify(event, null, 2));
    
    try {
        const { userId } = event;
        
        if (!userId) {
            return {
                valid: false,
                error: 'userId is required'
            };
        }

        // Query the RunningStreams table for the user
        const queryParams = {
            TableName: process.env.RUNNING_STREAMS_TABLE_NAME,
            KeyConditionExpression: 'userId = :userId',
            FilterExpression: 'running = :running',
            ExpressionAttributeValues: marshall({
                ':userId': userId,
                ':running': true
            })
        };

        const result = await dynamoClient.send(new QueryCommand(queryParams));
        
        if (result.Items && result.Items.length > 0) {
            const stream = unmarshall(result.Items[0]);
            return {
                valid: true,
                sessionId: stream.sessionId,
                instanceArn: stream.instanceArn
            };
        } else {
            return {
                valid: false,
                message: 'No running streams found for user'
            };
        }
        
    } catch (error) {
        console.error('Error checking running streams:', error);
        return {
            valid: false,
            error: error.message
        };
    }
};
