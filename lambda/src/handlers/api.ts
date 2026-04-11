import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    PutCommand,
    ScanCommand,
    GetCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    SFNClient,
    StartExecutionCommand,
    StartExecutionCommandOutput,
    DescribeExecutionCommand,
    GetExecutionHistoryCommand,
    HistoryEvent,
    TaskFailedEventDetails,
    LambdaFunctionFailedEventDetails,
} from "@aws-sdk/client-sfn";

import { SFNClientConfig } from "@aws-sdk/client-sfn";
import { DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import DynamoDBWrapper from "../utils/dynamoDbWrapper";
import EC2Wrapper from "../utils/ec2Wrapper";
import {
    createCheckoutSession,
    getCheckoutSession,
    constructWebhookEvent,
    findOrCreateCustomer,
} from "../utils/stripeWrapper";
import { getPaymentPlanById, validatePlanId } from "../shared/payment-plans";

// Configure clients to use local endpoints when available (for local testing)
const sfnClientConfig: Partial<SFNClientConfig> = {};
const dynamoClientConfig: Partial<DynamoDBClientConfig> = {};

if (process.env.STEPFUNCTIONS_ENDPOINT) {
    sfnClientConfig.endpoint = process.env.STEPFUNCTIONS_ENDPOINT;
}

if (process.env.DYNAMODB_ENDPOINT) {
    dynamoClientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const sfnClient = new SFNClient(sfnClientConfig);
const dynamoClient = new DynamoDBClient(dynamoClientConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const RUNNING_INSTANCES_TABLE_NAME = process.env.RUNNING_INSTANCES_TABLE_NAME || "";
const RUNNING_STREAMS_TABLE_NAME = process.env.RUNNING_STREAMS_TABLE_NAME || "";
const GAMES_TABLE_NAME = process.env.GAMES_TABLE_NAME || "";
const USER_DEPLOY_EC2_WORKFLOW_ARN = process.env.USER_DEPLOY_EC2_WORKFLOW_ARN || "";
const TERMINATE_WORKFLOW_ARN = process.env.TERMINATE_WORKFLOW_ARN || "";
const USER_PAYMENTS_TABLE_NAME = process.env.USER_PAYMENTS_TABLE_NAME || "";
const USER_BALANCES_TABLE_NAME = process.env.USER_BALANCES_TABLE_NAME || "";
// NOTE: Read at request time so tests can override via process.env
const getStripeWhSecret = (): string => process.env.STRIPE_WH_SECRET || "";
const ec2Region = process.env.LAMBDA_REGION || process.env.AWS_REGION || "us-west-2";

interface GameItem {
    gameId: string;
    name: string;
    description: string;
    imageUrl: string;
    tags: string[];
    modes?: string[];
    amiId: string;
    minInstanceType: string;
    ebsSnapshotId?: string; // optional, retained for future EBS-based approaches
}

interface DeployInstanceRequest {
    userId: string;
    gameId: string;
}

interface TerminateInstanceRequest {
    userId: string;
    instanceId?: string;
}

interface CreateCheckoutRequest {
    planId: string;
    userId?: string;
}

interface ResponseBody {
    userId?: string;
    error?: string;
    message: string;
    status?: string;
    statusCode?: number;
    sessionId?: string;
    authToken?: string;
    streamingLink?: string;
    dcvUser?: string;
    instanceArn?: string;
    executionArn?: string;
    updatedAt?: string;
    [key: string]: unknown; // Allow other properties from streamRecord
}

type RunningInstanceTrackingRecord = {
    instanceId?: string;
    executionArn?: string;
    status?: string;
    creationTime?: string;
    lastModifiedTime?: string;
};

type RunningStreamRecord = {
    userId?: string;
    instanceId?: string;
    instanceArn?: string;
    status?: string;
    streamingLink?: string;
    dcvIp?: string;
    dcvPort?: number;
    dcvUser?: string;
    dcvPassword?: string;
    createdAt?: string;
    updatedAt?: string;
};

// Helper function to format responses consistently
const createResponse = (statusCode: number, body: ResponseBody): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
});

const verifyUserBalance = async (
    userId: string,
): Promise<{ hasBalance: boolean; coins: number }> => {
    const dbWrapper = new DynamoDBWrapper(USER_BALANCES_TABLE_NAME);
    const balance = await dbWrapper.getItem({ userId });
    const coins = (balance?.coins as number) ?? 0;
    return { hasBalance: coins > 0, coins };
};

const TRACKED_EXECUTION_STATUS_PRIORITY = ["terminating", "running", "deploying", "stopped"];

const selectTrackedInstanceRecord = (
    instances: RunningInstanceTrackingRecord[],
): RunningInstanceTrackingRecord | null => {
    const withExecutionArn = instances.filter((instance) => Boolean(instance.executionArn));
    if (withExecutionArn.length === 0) {
        return null;
    }

    for (const status of TRACKED_EXECUTION_STATUS_PRIORITY) {
        const match = withExecutionArn.find((instance) => instance.status === status);
        if (match) {
            return match;
        }
    }

    return withExecutionArn[0];
};

const getLatestRunningStreamForUser = async (
    userId: string,
): Promise<{ instanceId?: string } | null> => {
    if (!RUNNING_STREAMS_TABLE_NAME) {
        return null;
    }

    const queryCommand = new QueryCommand({
        TableName: RUNNING_STREAMS_TABLE_NAME,
        IndexName: "UserIdIndex",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
            ":userId": userId,
        },
        ScanIndexForward: false,
    });

    const queryResult = (await docClient.send(queryCommand)) as {
        Items?: Array<{ instanceId?: string; status?: string }>;
    };
    const runningStream = (queryResult.Items || []).find((item) => item.status === "running");

    return runningStream ?? null;
};

const resolveTrackedInstanceId = async (
    userId: string,
    explicitInstanceId?: string,
): Promise<string | null> => {
    if (explicitInstanceId) {
        return explicitInstanceId;
    }

    const runningStream = await getLatestRunningStreamForUser(userId);
    if (runningStream?.instanceId) {
        return String(runningStream.instanceId);
    }

    const dbWrapper = new DynamoDBWrapper(RUNNING_INSTANCES_TABLE_NAME);
    const instances = (await dbWrapper.queryByUserId(userId)) as RunningInstanceTrackingRecord[];
    const fallbackInstance = instances.find((instance) => {
        const instanceId = String(instance.instanceId || "");
        if (instanceId.startsWith("pending-")) {
            return false;
        }

        return ["running", "terminating", "stopped"].includes(String(instance.status || ""));
    });

    return fallbackInstance?.instanceId ? String(fallbackInstance.instanceId) : null;
};

/**
 * List all games from the Games table
 * GET /games
 */
const handleListGames = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const tableName = process.env.GAMES_TABLE_NAME || "";
        if (!tableName) {
            return createResponse(500, {
                error: "Internal Server Error",
                message: "Games table not configured",
            });
        }

        console.log("Scanning Games table for all games");

        const scanCommand = new ScanCommand({
            TableName: tableName,
        });

        const result = await docClient.send(scanCommand);
        const games = (result.Items || []) as GameItem[];

        console.log(`Retrieved ${games.length} games from database`);

        return createResponse(200, {
            message: "Games retrieved successfully",
            data: games,
        });
    } catch (error: unknown) {
        console.error("Error listing games:", error);
        return createResponse(500, {
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : "Unknown error occurred",
        });
    }
};

/**
 * Get a single game by gameId
 * GET /games/{gameId}
 */
const handleGetGameById = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const tableName = process.env.GAMES_TABLE_NAME || "";
        if (!tableName) {
            return createResponse(500, {
                error: "Internal Server Error",
                message: "Games table not configured",
            });
        }

        // Extract gameId from path parameters
        const gameId = event.pathParameters?.gameId;

        if (!gameId) {
            return createResponse(400, {
                error: "Bad Request",
                message: "gameId path parameter is required",
            });
        }

        console.log(`Fetching game with ID: ${gameId}`);

        const getCommand = new GetCommand({
            TableName: tableName,
            Key: { gameId },
        });

        const result = await docClient.send(getCommand);
        const game = result.Item as GameItem | undefined;

        if (!game) {
            return createResponse(404, {
                error: "Not Found",
                message: `Game with ID '${gameId}' not found`,
            });
        }

        console.log(`Retrieved game: ${game.name}`);

        return createResponse(200, {
            message: "Game retrieved successfully",
            data: game,
        });
    } catch (error: unknown) {
        console.error("Error fetching game:", error);
        return createResponse(500, {
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : "Unknown error occurred",
        });
    }
};

// Deploy Instance Handler
const handleDeployInstance = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const body: DeployInstanceRequest = JSON.parse(event.body || "{}");
        const { userId, gameId } = body;

        if (!RUNNING_INSTANCES_TABLE_NAME) {
            throw new Error("MissingRunningInstancesTable");
        }

        if (!userId) {
            return createResponse(400, { message: "User ID is required" });
        }

        if (!gameId) {
            return createResponse(400, { message: "Game ID is required" });
        }

        const gamesTableName = process.env.GAMES_TABLE_NAME || "";
        if (!gamesTableName) {
            return createResponse(500, {
                message: "Internal server error: Games table not configured",
            });
        }

        // Look up the game to get its AMI ID and instance type
        const gameResult = await docClient.send(
            new GetCommand({
                TableName: gamesTableName,
                Key: { gameId },
            }),
        );

        const game = gameResult.Item as GameItem | undefined;

        if (!game) {
            return createResponse(404, { message: `Game '${gameId}' not found` });
        }

        if (!game.amiId) {
            return createResponse(400, { message: `Game '${gameId}' has no AMI configured` });
        }

        if (!USER_BALANCES_TABLE_NAME) {
            return createResponse(500, {
                message: "Internal server error: Balance table not configured",
            });
        }

        // Payment guard: user must have coins to deploy
        const { hasBalance } = await verifyUserBalance(userId);
        if (!hasBalance) {
            return createResponse(402, {
                message: "Insufficient balance. Please purchase a coin pack to deploy.",
                status: "payment_required",
            });
        }

        // Start the UserDeployEC2 Step Function
        if (!USER_DEPLOY_EC2_WORKFLOW_ARN) {
            return createResponse(500, { message: "UserDeployEC2 Step Function ARN is not set" });
        }

        const stepFunctionInput = {
            userId,
            gameId,
            amiId: game.amiId,
            instanceType: game.minInstanceType,
        };

        const executionName = `${userId}-${Date.now()}`;

        const isLocalTesting =
            process.env.NODE_ENV === "local" || process.env.STEPFUNCTIONS_ENDPOINT;
        let executionResponse: StartExecutionCommandOutput;

        if (isLocalTesting && process.env.STEPFUNCTIONS_ENDPOINT) {
            try {
                const startExecutionCommand = new StartExecutionCommand({
                    stateMachineArn: USER_DEPLOY_EC2_WORKFLOW_ARN,
                    input: JSON.stringify(stepFunctionInput),
                    name: executionName,
                });
                executionResponse = await sfnClient.send(startExecutionCommand);
                console.log("Step Function execution started via local endpoint");
            } catch {
                console.log(
                    "Local Step Functions endpoint not available, using mock execution ARN",
                );
                const mockExecutionArn = `arn:aws:states:us-east-1:123456789012:execution:UserDeployEC2Workflow:${executionName}`;
                executionResponse = {
                    executionArn: mockExecutionArn,
                    startDate: new Date(),
                    $metadata: {},
                } as StartExecutionCommandOutput;
            }
        } else {
            const startExecutionCommand = new StartExecutionCommand({
                stateMachineArn: USER_DEPLOY_EC2_WORKFLOW_ARN,
                input: JSON.stringify(stepFunctionInput),
                name: executionName,
            });
            executionResponse = await sfnClient.send(startExecutionCommand);
        }

        if (!executionResponse.executionArn) {
            throw new Error("Failed to start UserDeployEC2 Step Function");
        }

        // Store a placeholder record immediately so deployment-status can track progress
        // while the Step Function is running. The real instance record (written by
        // UpdateRunningInstances at the end of the workflow) will have a later creationTime
        // and will appear first in queryByUserId results once the workflow completes.
        const placeholderInstanceId = `pending-${executionName}`;
        const now = new Date().toISOString();
        try {
            await docClient.send(
                new PutCommand({
                    TableName: RUNNING_INSTANCES_TABLE_NAME,
                    Item: {
                        instanceId: placeholderInstanceId,
                        userId,
                        executionArn: executionResponse.executionArn,
                        status: "deploying",
                        creationTime: now,
                        lastModifiedTime: now,
                    },
                }),
            );
            console.log(`Stored deployment tracking record for user ${userId}`);
        } catch (dbError) {
            // Don't fail the request — the Step Function has already started
            console.error("Failed to store deployment tracking record:", dbError);
        }

        console.log(
            `Started Step Function execution ${executionResponse.executionArn} for user ${userId}`,
        );

        return createResponse(200, {
            status: "success",
            message: "Deployment workflow started successfully",
            statusCode: 200,
        });
    } catch (error) {
        console.error("Error deploying instance:", error);
        return createResponse(500, {
            message: "Failed to deploy instance",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};

// Terminate Instance Handler
const handleTerminateInstance = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const body: TerminateInstanceRequest = JSON.parse(event.body || "{}");
        const { userId, instanceId } = body;

        // Validate input
        if (!userId) {
            return createResponse(400, {
                status: "error",
                message: "User ID is required",
            });
        }

        // if (!instanceId) {
        //     return createResponse(400, {
        //         status: "error",
        //         message: "Instance ID is required",
        //     });
        // }

        // Validate environment variables
        if (!TERMINATE_WORKFLOW_ARN) {
            return createResponse(500, {
                status: "error",
                message: "Internal server error: Step Function configuration missing",
            });
        }

        if (!RUNNING_INSTANCES_TABLE_NAME) {
            return createResponse(500, {
                status: "error",
                message: "Internal server error: Database configuration missing",
            });
        }

        // Start the UserTerminateEC2 Step Function
        const stepFunctionInput = {
            userId: userId,
        };

        const executionName = `${userId}-${Date.now()}`;

        let executionResponse: StartExecutionCommandOutput;

        try {
            const startExecutionCommand = new StartExecutionCommand({
                stateMachineArn: TERMINATE_WORKFLOW_ARN,
                input: JSON.stringify(stepFunctionInput),
                name: executionName,
            });
            executionResponse = await sfnClient.send(startExecutionCommand);
        } catch (error) {
            // Handle specific Step Function errors
            if (error instanceof Error) {
                if (error.name === "ExecutionAlreadyExists") {
                    return createResponse(409, {
                        status: "error",
                        message: "Termination workflow is already in progress",
                    });
                }

                if (error.name === "StateMachineDoesNotExist") {
                    return createResponse(500, {
                        status: "error",
                        message: "Internal server error: Workflow configuration error",
                    });
                }
            }

            // For other Step Function errors, return expected format
            return createResponse(500, {
                status: "error",
                message: "Failed to start termination workflow",
                error: "Unknown error",
            });
        }

        if (!executionResponse.executionArn) {
            return createResponse(500, {
                status: "error",
                message: "Failed to start termination workflow",
            });
        }

        // Persist the active terminate execution so deployment-status follows the
        // new workflow instead of a stale deploy execution.
        try {
            const trackedInstanceId = await resolveTrackedInstanceId(userId, instanceId);
            if (trackedInstanceId) {
                const timestamp = new Date().toISOString();
                const dbWrapper = new DynamoDBWrapper(RUNNING_INSTANCES_TABLE_NAME);
                await dbWrapper.updateItem(
                    { instanceId: trackedInstanceId },
                    {
                        UpdateExpression:
                            "SET executionArn = :arn, #status = :status, lastModifiedTime = :timestamp",
                        ExpressionAttributeNames: {
                            "#status": "status",
                        },
                        ExpressionAttributeValues: {
                            ":arn": executionResponse.executionArn,
                            ":status": "terminating",
                            ":timestamp": timestamp,
                        },
                    },
                );
                console.log(
                    `Updated tracking record for instance ${trackedInstanceId} with terminate execution ${executionResponse.executionArn}`,
                );
            } else {
                console.warn(
                    `Could not resolve an active instance record for terminate tracking (userId=${userId})`,
                );
            }
        } catch (dbError) {
            // Don't fail the request since Step Function was already started
            console.error("Failed to update terminate tracking record:", dbError);
        }

        console.log(
            `Started Step Function execution ${executionResponse.executionArn} for user ${userId}`,
        );

        return createResponse(200, {
            status: "success",
            message: "Termination workflow started successfully",
            executionArn: executionResponse.executionArn,
        });
    } catch (error) {
        // Handle JSON parsing errors and other unexpected errors
        console.error("Error terminating instance:", error);

        return createResponse(500, {
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
};

// Streaming Link Handler
const handleStreamingLink = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Extract and validate userId
        const userId = event.queryStringParameters?.userId;

        if (!userId) {
            return createResponse(400, {
                error: "Bad Request",
                message: "userId query parameter is required",
            });
        }

        console.log(`Querying RunningStreams table for userId: ${userId}`);

        // Query the RunningStreams table by userId using the UserIdIndex
        const queryCommand = new QueryCommand({
            TableName: RUNNING_STREAMS_TABLE_NAME,
            IndexName: "UserIdIndex",
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: {
                ":userId": userId,
            },
            ScanIndexForward: false,
        });

        const queryResult = (await docClient.send(queryCommand)) as {
            Items?: RunningStreamRecord[];
        };
        const results = queryResult.Items || [];

        if (results.length === 0) {
            return createResponse(404, {
                error: "Not Found",
                message: `No active streaming session found for userId: ${userId}`,
            });
        }

        const runningInstancesDb = RUNNING_INSTANCES_TABLE_NAME
            ? new DynamoDBWrapper(RUNNING_INSTANCES_TABLE_NAME)
            : null;
        const ec2Wrapper = new EC2Wrapper(ec2Region);

        let streamRecord: RunningStreamRecord | null = null;

        for (const candidate of results) {
            if (candidate.status !== "running") {
                continue;
            }

            if (!runningInstancesDb || !candidate.instanceId) {
                streamRecord = candidate;
                break;
            }

            const instanceRecord = await runningInstancesDb.getItem(
                { instanceId: candidate.instanceId },
                { ConsistentRead: true },
            );

            if (instanceRecord?.status === "running") {
                try {
                    const instanceDetails = await ec2Wrapper.getInstanceDetails(
                        candidate.instanceId,
                    );
                    if (instanceDetails.state !== "running") {
                        continue;
                    }
                } catch (error) {
                    console.warn(
                        `Skipping streaming candidate ${candidate.instanceId}; failed EC2 state check`,
                        error,
                    );
                    continue;
                }

                streamRecord = candidate;
                break;
            }
        }

        if (!streamRecord) {
            return createResponse(404, {
                error: "Not Found",
                message: `No active streaming session found for userId: ${userId}`,
            });
        }

        console.log(`Found streaming session for userId ${userId}:`, streamRecord);

        // Extract connection details
        const dcvHost = streamRecord.dcvIp;
        const dcvPort = streamRecord.dcvPort || 8443;
        const dcvUser = streamRecord.dcvUser || "Administrator";
        const dcvPassword = streamRecord.dcvPassword;

        // Use nip.io domain for valid SSL certificates (fallback if not stored)
        const nipDomain = dcvHost ? dcvHost.replace(/\./g, "-") + ".nip.io" : "";
        const streamingLink = streamRecord.streamingLink || `https://${nipDomain}:${dcvPort}`;

        // Session ID for DCV connection (default console session)
        const sessionId = "console";

        // Return session info WITH password for MVP
        // NOTE: In production, implement proper token-based auth via DCV Session Connection Broker
        // For MVP, the DCV Web SDK requires credentials for WebSocket authentication
        return createResponse(200, {
            message: "Streaming session found",
            userId: streamRecord.userId,
            instanceId: streamRecord.instanceId,
            instanceArn: streamRecord.instanceArn,
            streamingLink,
            dcvIp: dcvHost,
            dcvPort,
            dcvUser,
            dcvPassword, // Included for MVP - DCV SDK requires credentials
            sessionId,
            createdAt: streamRecord.createdAt,
            updatedAt: streamRecord.updatedAt,
        });
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Error occurred:", error.message);
            console.error("Stack trace:", error.stack);
        }

        return createResponse(500, {
            error: "Internal Server Error",
            message: "An unexpected error occurred while fetching streaming link",
        });
    }
};

// ============================================================================
// Deployment Status Handler
// ============================================================================

// Define workflow steps for deploy and terminate workflows
const DEPLOY_STEPS = [
    { name: "CheckRunningStreams", displayName: "Checking existing streams", order: 1 },
    { name: "DeployEC2", displayName: "Deploying EC2 instance", order: 2 },
    { name: "WaitForInstanceReady", displayName: "Waiting for instance to be ready", order: 3 },
    { name: "UpdateRunningStreams", displayName: "Updating streaming database", order: 4 },
    { name: "UpdateRunningInstances", displayName: "Finalizing session", order: 5 },
    { name: "Success", displayName: "Deployment complete", order: 6 },
];

const TERMINATE_STEPS = [
    { name: "CheckRunningStreams", displayName: "Checking running streams", order: 1 },
    { name: "CheckRunningInstances", displayName: "Checking instance state", order: 2 },
    { name: "StopDCV", displayName: "Stopping DCV session", order: 3 },
    { name: "StopEC2", displayName: "Stopping EC2 instance", order: 4 },
    { name: "UpdateRunningStreams", displayName: "Updating streaming database", order: 5 },
    { name: "UpdateRunningInstances", displayName: "Updating instance database", order: 6 },
    { name: "TerminationSuccess", displayName: "Termination complete", order: 7 },
];

interface StepInfo {
    currentStep: string;
    currentStepName: string;
    stepNumber: number;
    totalSteps: number;
    completedSteps: string[];
    progress: number;
}

// Extract current step from execution history
const getStepInfoFromHistory = (events: HistoryEvent[], isTerminate: boolean): StepInfo | null => {
    const steps = isTerminate ? TERMINATE_STEPS : DEPLOY_STEPS;
    const totalSteps = steps.length;
    const completedSteps: string[] = [];
    let currentStep = steps[0].name;
    let currentStepName = steps[0].displayName;
    let stepNumber = 1;

    for (const event of events) {
        if (event.type === "TaskStateEntered" || event.type === "WaitStateEntered") {
            const details = event.stateEnteredEventDetails;
            if (details?.name) {
                currentStep = details.name;
                const stepInfo = steps.find((s) => s.name === details.name);
                if (stepInfo) {
                    currentStepName = stepInfo.displayName;
                    stepNumber = stepInfo.order;
                }
            }
        } else if (event.type === "TaskStateExited" || event.type === "WaitStateExited") {
            const details = event.stateExitedEventDetails;
            if (details?.name && !completedSteps.includes(details.name)) {
                completedSteps.push(details.name);
            }
        } else if (event.type === "ExecutionSucceeded") {
            const lastStep = steps[steps.length - 1];
            return {
                currentStep: lastStep.name,
                currentStepName: lastStep.displayName,
                stepNumber: totalSteps,
                totalSteps,
                completedSteps: steps.map((s) => s.name),
                progress: 100,
            };
        }
    }

    const progress = Math.round((completedSteps.length / totalSteps) * 100);

    return {
        currentStep,
        currentStepName,
        stepNumber,
        totalSteps,
        completedSteps,
        progress,
    };
};

// Extract error details from execution history
const getErrorDetails = (
    events: HistoryEvent[],
): { errorStep: string; errorType: string; errorMessage: string } | null => {
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];

        if (event.type === "TaskFailed" || event.type === "LambdaFunctionFailed") {
            const details: TaskFailedEventDetails | LambdaFunctionFailedEventDetails | undefined =
                event.lambdaFunctionFailedEventDetails || event.taskFailedEventDetails;
            return {
                errorStep: "Unknown",
                errorType: details?.error || "TaskFailed",
                errorMessage: details?.cause || "Task execution failed",
            };
        }

        if (event.type === "ExecutionFailed") {
            const details = event.executionFailedEventDetails;
            return {
                errorStep: "Execution",
                errorType: details?.error || "ExecutionFailed",
                errorMessage: details?.cause || "Execution failed",
            };
        }

        if (event.type === "TaskStateEntered") {
            const stateDetails = event.stateEnteredEventDetails;
            for (let j = i + 1; j < events.length && j < i + 5; j++) {
                const nextEvent = events[j];
                if (nextEvent.type === "TaskFailed" || nextEvent.type === "LambdaFunctionFailed") {
                    const failDetails:
                        | TaskFailedEventDetails
                        | LambdaFunctionFailedEventDetails
                        | undefined =
                        nextEvent.lambdaFunctionFailedEventDetails ||
                        nextEvent.taskFailedEventDetails;
                    return {
                        errorStep: stateDetails?.name || "Unknown",
                        errorType: failDetails?.error || "TaskFailed",
                        errorMessage: failDetails?.cause || "Task execution failed",
                    };
                }
            }
        }
    }

    return null;
};

// Deployment Status Handler
const handleDeploymentStatus = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const userId = event.queryStringParameters?.userId;

        if (!userId) {
            return createResponse(400, {
                error: "BadRequest",
                message: "userId query parameter is required",
            });
        }

        const dbWrapper = new DynamoDBWrapper(RUNNING_INSTANCES_TABLE_NAME);
        const instances = await dbWrapper.queryByUserId(userId);

        if (!instances || instances.length === 0) {
            return createResponse(404, {
                error: "NotFound",
                message: `No running instance found for userId: ${userId}`,
                status: "NOT_FOUND",
            });
        }

        const runningInstance = selectTrackedInstanceRecord(
            instances as RunningInstanceTrackingRecord[],
        );

        if (!runningInstance?.executionArn) {
            return createResponse(404, {
                error: "NotFound",
                message: `No active deployment found for userId: ${userId}`,
                status: "NOT_FOUND",
            });
        }

        const execCommand = new DescribeExecutionCommand({
            executionArn: runningInstance.executionArn,
        });

        const exec = await sfnClient.send(execCommand);
        const executionArn = exec.executionArn || "";
        const isTerminate = executionArn.includes("Terminate");
        const status = exec.status || "UNKNOWN";

        // Get execution history for detailed step info
        let stepInfo: StepInfo | null = null;
        let errorDetails: { errorStep: string; errorType: string; errorMessage: string } | null =
            null;

        try {
            const historyCommand = new GetExecutionHistoryCommand({
                executionArn: exec.executionArn,
                maxResults: 100,
                reverseOrder: false,
            });
            const historyResult = await sfnClient.send(historyCommand);
            const events = historyResult.events || [];

            stepInfo = getStepInfoFromHistory(events, isTerminate);

            if (status === "FAILED" || status === "TIMED_OUT" || status === "ABORTED") {
                errorDetails = getErrorDetails(events);
            }
        } catch (historyError) {
            console.warn("Failed to get execution history:", historyError);
        }

        // Build response based on status
        switch (status) {
            case "RUNNING":
                return createResponse(200, {
                    status: "RUNNING",
                    message:
                        stepInfo?.currentStepName ||
                        (isTerminate ? "Termination in progress..." : "Deployment in progress..."),
                    deploymentStatus: isTerminate ? "terminating" : "deploying",
                    currentStep: stepInfo?.currentStep,
                    currentStepName: stepInfo?.currentStepName,
                    stepNumber: stepInfo?.stepNumber,
                    totalSteps: stepInfo?.totalSteps,
                    progress: stepInfo?.progress,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                });

            case "SUCCEEDED":
                const output = exec.output ? JSON.parse(exec.output) : {};

                if (isTerminate) {
                    return createResponse(200, {
                        status: "SUCCEEDED",
                        message: "Instance has been terminated",
                        deploymentStatus: "terminated",
                        instanceId: output.instanceId || runningInstance.instanceId,
                        progress: 100,
                        totalSteps: stepInfo?.totalSteps,
                        completedSteps: stepInfo?.completedSteps,
                        startedAt: exec.startDate?.toISOString(),
                        completedAt: exec.stopDate?.toISOString(),
                    });
                }

                return createResponse(200, {
                    status: "SUCCEEDED",
                    message: "Instance is ready for streaming",
                    deploymentStatus: "running",
                    instanceId: output.instanceId || runningInstance.instanceId,
                    dcvUrl: output.dcvUrl,
                    progress: 100,
                    totalSteps: stepInfo?.totalSteps,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                    completedAt: exec.stopDate?.toISOString(),
                });

            case "FAILED":
            case "TIMED_OUT":
            case "ABORTED":
                const errorOutput = exec.output ? JSON.parse(exec.output) : {};
                return createResponse(200, {
                    status: "FAILED",
                    message:
                        errorDetails?.errorMessage ||
                        errorOutput.message ||
                        exec.cause ||
                        "Deployment failed",
                    error:
                        errorDetails?.errorType ||
                        errorOutput.error ||
                        exec.error ||
                        "DeploymentFailed",
                    errorStep: errorDetails?.errorStep,
                    failedAt: stepInfo?.currentStepName,
                    progress: stepInfo?.progress,
                    stepNumber: stepInfo?.stepNumber,
                    totalSteps: stepInfo?.totalSteps,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                    failedAtTime: exec.stopDate?.toISOString(),
                });

            default:
                return createResponse(200, {
                    status: "UNKNOWN",
                    message: `Unknown execution status: ${status}`,
                });
        }
    } catch (error: unknown) {
        console.error("Error in handleDeploymentStatus:", error);
        if (error instanceof Error) {
            return createResponse(500, {
                error: error.name,
                message: error.message,
                status: "FAILED",
            });
        }
        return createResponse(500, {
            error: "UnknownError",
            message: "An unknown error occurred",
            status: "FAILED",
        });
    }
};

// POST /checkout-session
// creates stripe checkout session in embedded mode and returns the client_secret
const handleCreateCheckoutSession = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const body: CreateCheckoutRequest = JSON.parse(event.body || "{}");
        const { planId, userId } = body;

        if (!planId || !validatePlanId(planId)) {
            return createResponse(400, { message: "A valid planId is required" });
        }

        const plan = getPaymentPlanById(planId);
        if (!plan) {
            return createResponse(400, { message: `Unknown plan: ${planId}` });
        }

        if (!plan.stripePriceId) {
            return createResponse(500, {
                message: `Stripe Price ID not configured for plan ${planId}. Set STRIPE_PRICE_${planId} env var.`,
            });
        }

        let stripeCustomerId: string | undefined;
        if (userId) {
            stripeCustomerId = await findOrCreateCustomer(userId);
        }

        const returnUrl = `${process.env.FRONTEND_URL}/topup/return?sessionId={CHECKOUT_SESSION_ID}`;

        const { clientSecret, sessionId } = await createCheckoutSession({
            priceId: plan.stripePriceId,
            returnUrl,
            metadata: {
                planId,
                ...(userId ? { userId } : {}),
            },
            ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
        });

        return createResponse(200, {
            message: "Checkout session created",
            clientSecret,
            sessionId,
        });
    } catch (error) {
        console.error("Error creating checkout session:", error);
        return createResponse(500, {
            message: "Failed to create checkout session",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};

// GET /checkout-session?sessionId=xxxxx
// retrieves status of stripe checkout session so the return page can show success / failure
const handleGetCheckoutSession = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const sessionId = event.queryStringParameters?.sessionId;
        if (!sessionId) {
            return createResponse(400, { message: "sessionId query parameter is required" });
        }
        const session = await getCheckoutSession(sessionId);

        return createResponse(200, {
            message: "Session retrieved",
            status: session.status,
            paymentStatus: session.paymentStatus,
            customerEmail: session.customerEmail,
            amountTotal: session.amountTotal,
        } as unknown as ResponseBody);
    } catch (error) {
        console.error("Error retrieving session status:", error);
        return createResponse(500, {
            message: "Failed to retrieve session status",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};

const handleStripeWebhook = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // api gateway may decode it -> safety lines here
        const rawBody = event.isBase64Encoded
            ? Buffer.from(event.body || "", "base64").toString("utf8")
            : event.body || "";

        // extract stripe signature
        const signature =
            event.headers["stripe-signature"] || event.headers["Stripe-Signature"] || "";

        if (!signature) {
            return createResponse(400, { message: "Missing stripe-signature header" });
        }

        const whSecret = getStripeWhSecret();
        if (!whSecret) {
            console.error("STRIPE_WH_SECRET environment variable is not set");
            return createResponse(500, { message: "Webhook secret not configured" });
        }

        let stripeEvent: { type: string; data: { object: Record<string, unknown> } };
        try {
            stripeEvent = constructWebhookEvent(
                rawBody,
                signature,
                whSecret,
            ) as unknown as typeof stripeEvent;
        } catch (err) {
            console.error("Webhook signature verification failed:", err);
            return createResponse(400, { message: "Invalid signature" });
        }

        switch (stripeEvent.type) {
            case "checkout.session.completed":
                await handleCheckoutCompleted(stripeEvent.data.object);
                break;
            default:
                console.log(`Unhandled webhook event type: ${stripeEvent.type}`);
        }

        // ack all other stripe events with a 200 -> ROOM FOR EXPANSION HERE
        return createResponse(200, { message: "Webhook processed" });
    } catch (error) {
        console.error("Webhook handler error:", error);
        return createResponse(500, {
            message: "Webhook processing failed",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};

const handleCheckoutCompleted = async (session: Record<string, unknown>): Promise<void> => {
    // ------------------------------------------------------------------
    // Step 1: Extract fields from the Stripe session object
    // ------------------------------------------------------------------
    const stripeSessionId = session.id as string;
    const stripeCustomerId = (session.customer as string) || undefined;
    const metadata = (session.metadata as Record<string, string>) || {};
    const { planId, userId } = metadata;
    const customerEmail = (session.customer_details as Record<string, unknown>)?.email as
        | string
        | undefined;

    if (!planId || !userId) {
        console.warn("Webhook missing planId or userId in metadata:", metadata);
        return;
    }

    // record plan in log
    const plan = getPaymentPlanById(planId);
    if (!plan) {
        console.error(`Unknown planId in webhook: ${planId}`);
        return;
    }

    const now = new Date().toISOString();

    // Atomic idempotency: conditional put keyed by stripeSessionId.
    // ConditionalCheckFailedException means this session was already processed.
    const paymentsDb = new DynamoDBWrapper(USER_PAYMENTS_TABLE_NAME);
    try {
        await paymentsDb.putItem(
            {
                stripeSessionId,
                userId,
                createdAt: now,
                stripeCustomerId: stripeCustomerId || "unknown",
                planId,
                coins: plan.coins,
                priceCents: plan.priceCents,
                status: "completed",
                customerEmail: customerEmail || "unknown",
            },
            { ConditionExpression: "attribute_not_exists(stripeSessionId)" },
        );
    } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
            console.log(`Payment already recorded for session ${stripeSessionId}, skipping`);
            return;
        }
        throw error;
    }

    // actually grant coins to end user
    const balancesDb = new DynamoDBWrapper(USER_BALANCES_TABLE_NAME);
    await balancesDb.updateItem(
        { userId },
        {
            UpdateExpression: "ADD coins :c SET updatedAt = :t, stripeCustomerId = :s",
            ExpressionAttributeValues: {
                ":c": plan.coins,
                ":t": now,
                ":s": stripeCustomerId || "unknown",
            },
        },
    );

    console.log(`Payment recorded: ${userId} bought ${plan.name} (${plan.coins} coins)`);
};

// Main handler that routes to the appropriate function
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Event:", JSON.stringify(event, null, 2));

    const path = event.resource || event.path;
    const method = event.httpMethod;

    try {
        // Route based on path and method
        if (path === "/deployInstance" && method === "POST") {
            return await handleDeployInstance(event);
        } else if (path === "/terminateInstance" && method === "POST") {
            return await handleTerminateInstance(event);
        } else if (path === "/streamingLink" && method === "GET") {
            return await handleStreamingLink(event);
        } else if (path === "/deployment-status" && method === "GET") {
            return await handleDeploymentStatus(event);
        } else if (path === "/checkout-session" && method === "POST") {
            return await handleCreateCheckoutSession(event);
        } else if (path === "/checkout-session" && method === "GET") {
            return await handleGetCheckoutSession(event);
        } else if (path === "/stripe-webhook" && method === "POST") {
            return await handleStripeWebhook(event);
        } else if (path === "/balance" && method === "GET") {
            const userId = event.queryStringParameters?.userId;
            if (!userId) return createResponse(400, { error: "userId is required" });
            const { coins } = await verifyUserBalance(userId);
            return createResponse(200, { coins });
        } else if (path === "/games" && method === "GET") {
            return await handleListGames(event);
        } else if (path?.startsWith("/games/") && method === "GET") {
            return await handleGetGameById(event);
        } else {
            return createResponse(404, {
                error: "Not Found",
                message: `Route not found: ${method} ${path}`,
            });
        }
    } catch (error) {
        console.error("Unhandled error:", error);
        return createResponse(500, {
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
