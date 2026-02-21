#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WorkflowRegistry } from "../lib/workflows";
import { IAMStack } from "../lib/iam-stack";
import { AuthStack } from "../lib/auth-stack";
import { StorageStack } from "../lib/storage-stack";
import { ComputeStack } from "../lib/compute-stack";
import { ApiStack } from "../lib/api-stack";

// Discover and register workflows before creating the stacks
WorkflowRegistry.discoverWorkflows();

const app = new cdk.App();

const iamStack = new IAMStack(app, "IAMStack");
const authStack = new AuthStack(app, "AuthStack");
const storageStack = new StorageStack(app, "StorageStack");
const computeStack = new ComputeStack(app, "ComputeStack", {
    ec2InstanceProfileArn: iamStack.ec2InstanceProfileArn,
    ec2InstanceProfileName: iamStack.ec2InstanceProfileName,
    runningInstancesTable: storageStack.runningInstancesTable,
    runningStreamsTable: storageStack.runningStreamsTable,
});
const apiStack = new ApiStack(app, "ApiStack", {
    apiFunction: computeStack.apiFunction,
});