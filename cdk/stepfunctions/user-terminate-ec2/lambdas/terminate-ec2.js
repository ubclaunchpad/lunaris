/**
 * Lambda function stub for TerminateEC2
 * Input: { userId: string }
 * Output: { success: boolean, message?: string }
 * 
 * NOTE: This is a stub implementation. The actual TerminateEC2 functionality
 * hasn't been implemented yet, so this just returns a success response.
 */
exports.handler = async (event) => {
    console.log('TerminateEC2 event:', JSON.stringify(event, null, 2));
    
    try {
        const { userId } = event;
        
        if (!userId) {
            return {
                success: false,
                error: 'userId is required'
            };
        }

        // TODO: Implement actual EC2 termination logic here
        console.log(`TerminateEC2 called`);
        
        return {
            success: true,
            message: 'EC2 termination completed (stub implementation)'
        };
        
    } catch (error) {
        console.error('Error in TerminateEC2:', error);
        return {
            success: false,
            error: error.message
        };
    }
};
