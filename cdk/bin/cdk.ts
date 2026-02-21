#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WorkflowRegistry } from "../lib/workflows";
import { AuthStack } from "../lib/auth-stack";
import { ComputeStack } from "../lib/compute-stack";
import { ApiStack } from "../lib/api-stack";

// Discover and register workflows before creating the stacks
WorkflowRegistry.discoverWorkflows();

const app = new cdk.App();

const authStack = new AuthStack(app, "AuthStack");
const computeStack = new ComputeStack(app, "ComputeStack");
new ApiStack(app, "ApiStack", {
    apiFunction: computeStack.apiFunction,
    // userPool: authStack.userPool, // Uncomment to enable Cognito auth
});
