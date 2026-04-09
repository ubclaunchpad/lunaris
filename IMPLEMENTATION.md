# Lunaris Game Streaming — Backend Implementation Plan

## Overview

Goal: Allow a user to select a game in the frontend, trigger an EC2 instance launch using a game-specific AMI, and stream it in-browser via DCV.

The CDK infrastructure and Lambda handlers for deploy/terminate workflows exist, but game selection is disconnected from AMI selection. This document tracks all implementation work to close that gap.

### End-to-End Flow

```
User logs in (Cognito)
    → POST /deployInstance { userId, gameId }
    → API lambda looks up game in Games table → gets amiId, instanceType
    → Starts UserDeployEC2 Step Function { userId, gameId, amiId, instanceType }
        → CheckRunningStreams (is user already streaming?)
        → CheckRunningInstances (does user have a stopped instance to resume?)
        → DeployEC2 (launch EC2 with that AMI) OR ResumeDeployInstance (start stopped instance)
        → Wait for instance ready
        → ConfigureDcvInstance (SSM command to set DCV session + password on the instance)
        → UpdateRunningStreams (write streamingLink, dcvIp, dcvUser, dcvPassword to DynamoDB)
        → UpdateRunningInstances (write instanceId, instanceArn, userId, gameId to DynamoDB)
    → Frontend polls GET /deployment-status?userId=X (shows loading state)
    → Frontend calls GET /streamingLink?userId=X once ready
    → Returns streamingLink from RunningStreams table
    → Frontend embeds DCV web client → user streams the game

User ends session:
    → POST /terminateInstance { userId }
    → UserTerminateEC2 Step Function
        → CheckRunningStreams → CheckRunningInstances
        → StopDCV (SSM command to close DCV session)
        → StopEC2 (stop EC2 instance — preserves state for resume, cheaper than terminate)
        → UpdateRunningStreams + UpdateRunningInstances (mark as stopped)
```

---

## Status Key

- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Complete
- `[!]` — Blocked / needs decision

---

## Phase 1 — Game-Aware Deployment

**Goal:** User selects a game → correct AMI launches → game runs in DCV.

### 1.1 Add `amiId` to the Games DynamoDB table schema ✅

- [x] Add `amiId: string` field to `GameItem` interface in `lambda/src/handlers/api.ts`
- [x] `ebsSnapshotId` kept as optional field (`ebsSnapshotId?`) for future EBS-based approaches
- [x] Update `dynamodb-tables.ts` schema comment to document `amiId` field

### 1.2 Update API deploy endpoint to accept and validate `gameId` ✅

Files: `lambda/src/handlers/api.ts`

- [x] Add `gameId: string` to the `DeployInstanceRequest` interface
- [x] Validate `gameId` is present in the request body (return 400 if missing)
- [x] Perform a DynamoDB `GetItem` on the `Games` table using `gameId` to fetch `amiId` and `minInstanceType`
- [x] Return 404 if `gameId` is not found in the Games table
- [x] Return 400 if the game record is missing `amiId`
- [x] Add `GAMES_TABLE_NAME` module-level constant (runtime read via `process.env` inside handlers)
- [x] Pass `{ userId, gameId, amiId, instanceType }` as the Step Function input

### 1.3 Thread `gameId` and `amiId` through the deploy Step Function ✅

File: `cdk/stepfunctions/user-deploy-ec2/definition.asl.json`

- [x] `DeployEC2` state Payload includes `gameId`, `amiId`, `instanceType`
- [x] `ResumeDeployInstance` state Payload forwards `gameId`
- [x] `MergeResumeData` Pass state carries `gameId`, `amiId`, `instanceType`
- [x] `PrepareUpdatePayload` Pass state includes `gameId`
- [x] `UpdateRunningInstances` state Payload includes `gameId`

### 1.4 Update `deploy-ec2` lambda to use `amiId` from event ✅

File: `lambda/src/handlers/user-deploy-ec2/deploy-ec2.ts`

- [x] `DeployEc2Event` type has `gameId`, `amiId`, `instanceType`
- [x] SSM parameter lookup removed — uses `event.amiId` directly
- [x] `instanceType` from event passed to `EC2InstanceConfig`
- [x] EC2 instance tagged with `GameId: event.gameId`
- [x] `SSMWrapper` import removed from this handler
- [x] `BASE_EBS_SNAPSHOT_ID` removed from `deploy-ec2.config.ts` envVars

### 1.5 Remove per-game SSM AMI lookup policy ✅

File: `cdk/lib/constructs/iam/lambda-policies.ts`

- [x] `ssm:GetParameter` for `/ami_id` removed from `getDeployEC2Policies()`

### 1.6 Store `gameId` in the `RunningInstances` table ✅

Files: `lambda/src/handlers/user-deploy-ec2/update-running-instances.ts`

- [x] `gameId?` added to `UpdateRunningInstancesEvent` type
- [x] `gameId` conditionally added to DynamoDB update expression
- [x] `dynamodb-tables.ts` schema comment updated with `gameId`

### 1.7 Register `/games` and `/games/{gameId}` in API Gateway ✅

File: `cdk/lib/constructs/api/api-gateway.ts`

- [x] `GET /games` added to `ENDPOINTS` (noAuth)
- [x] `GET /games/{gameId}` added to `ENDPOINTS` (noAuth)
- [x] `addEndpoint` updated to handle nested path segments (e.g. `games/{gameId}`)

### 1.8 Remove `BASE_EBS_SNAPSHOT_ID` from `deploy-ec2.config.ts` ✅

File: `cdk/lambdas/deploy-ec2.config.ts`

- [x] `BASE_EBS_SNAPSHOT_ID` removed from `envVars` (was unused)

### 1.9 `ec2Wrapper.ts` already supports `instanceType` ✅

- [x] `EC2InstanceConfig.instanceType?: _InstanceType` already existed — no changes needed

---

## Phase 2 — Networking & Infrastructure Hardening

**Goal:** Remove placeholders, make the stack cleanly deployable to a real AWS account.

### 2.1 Fix hardcoded placeholder subnet in `compute-stack.ts`

File: `cdk/lib/compute-stack.ts:124`

- [ ] Remove or correct the IAM policy that references `subnet-12345678` — this resource ARN is non-functional
- [ ] Either delete the overly-scoped subnet policy (the broader `ec2:RunInstances` on `"*"` in `lambda-policies.ts` already covers launch), or replace with a real subnet ARN from context/SSM

### 2.2 Pass `SUBNET_ID` to the deploy lambda

Files: `lambda-types.ts`, `lambda-functions.ts`, `deploy-ec2.config.ts`, `compute-stack.ts`

- [ ] Add `SUBNET_ID?: string` to `LambdaEnvVarProvider` in `lambda-types.ts`
- [ ] Add `subnetId?: string` to `LambdaFunctionsProps` in `lambda-functions.ts` and wire it into the env var provider
- [ ] Add `"SUBNET_ID"` to `envVars` in `deploy-ec2.config.ts`
- [ ] Pass actual subnet ID into `ComputeStack` (from CDK context, SSM lookup, or hardcoded for now)

### 2.3 Scope `iam:PassRole` policy

File: `cdk/lib/constructs/iam/lambda-policies.ts:46`

- [ ] Change `resources: ["*"]` on the `iam:PassRole` statement to the specific EC2 instance role ARN (use CDK token/export from `IAMStack`)
- [ ] Wire the instance role ARN through to `LambdaFunctionsProps` or use `Fn.importValue`

### 2.4 Restrict or remove RDP port 3389 from DCV security group

File: `cdk/lib/constructs/compute/dcv-security-group.ts:43`

- [ ] Remove the port 3389 ingress rule for production, or restrict to a specific admin CIDR via CDK context parameter
- [ ] Document the decision in a comment

### 2.5 Add `SUBNET_ID` and `KEY_PAIR_NAME` as CDK context parameters

File: `cdk/cdk.json`

- [ ] Add `subnetId` and optionally `keyPairName` to `cdk.json` context block
- [ ] Update `compute-stack.ts` to read these from `this.node.tryGetContext()`

---

---

## Optional / Future Features

These features are implemented in the codebase (infrastructure and Lambda handlers exist) but are not part of the current implementation plan. They should not be removed — keep the code in place and revisit when ready.

### Payments & Billing (Stripe)

The Stripe integration is fully wired: `POST /checkout-session`, `GET /checkout-session`, `POST /stripe-webhook`, and `UserPayments` + `UserBalances` DynamoDB tables all exist. The deploy workflow does **not** currently check or deduct balance before launching — adding that enforcement is the missing piece.

When to implement:
- **Pre-deploy balance check** — add `CheckUserBalance` as the first Step Function state; fail with `InsufficientBalanceError` if balance is zero
- **Post-deploy balance deduction** — add `DeductBalance` step after `UpdateRunningInstances`; use DynamoDB `ConditionExpression: balance >= :cost` to atomically deduct

### Session Duration & Cost Metrics

The CloudWatch dashboard already has `AverageSessionDuration` and `TotalCostEstimate` metric widgets. They just need publishers.

When to implement:
- Store `startedAt` in `RunningStreams` during deploy
- Compute duration in the terminate workflow and publish to CloudWatch
- Publish `TotalCostEstimate` based on duration × instance hourly rate

### Admin Game Catalog API

Endpoints to create/update/delete games without going directly to DynamoDB. Would require a Cognito `admin` user group and Cognito group claim checks inside the handlers.

When to implement:
- `POST /admin/games`, `PUT /admin/games/{gameId}`, `DELETE /admin/games/{gameId}`
- `CfnUserPoolGroup` for `"admin"` in the Cognito User Pool construct

### Instance-Ready Polling (replace fixed Wait)

The deploy Step Function uses two hardcoded 60-second `Wait` states (`WaitForInstanceReady`, `WaitForResumeInstanceReady`). These are fire-and-hope — sometimes too short, sometimes wasteful.

When to implement:
- New lambda: `check-instance-ready.ts` — calls `DescribeInstanceStatus`, returns `{ ready: bool }`
- Replace fixed Waits with: `Wait(15s)` → `CheckInstanceReady` → Choice(ready → next, else → loop, max 20 iterations)

### Resume-vs-Fresh Deploy Logic

The terminate workflow stops (not terminates) the EC2 instance to preserve EBS state, and the deploy workflow resumes a stopped instance instead of launching fresh. This saves ~60s boot time for returning users.

**Open question:** If a user played Game A, stopped, then selects Game B — the stopped instance has Game A's AMI. The current code does not handle this mismatch. Options: always terminate on stop (simplest), or check whether the stopped instance's `gameId` matches the new request before deciding to resume or terminate-and-redeploy.

### Observability

`ObservabilityStack` is deployed and active (CloudWatch dashboard + alarms for active instance count and deployment failure rate, scheduled Lambda for reconciliation). No action needed — works as-is.

---

## Known Issues

### Pre-existing test failures (not introduced by Phase 1)

Three test suites fail in their current state on this branch — these were not touched by Phase 1 work:

| File | Failure | Root cause |
|------|---------|------------|
| `test/utils/dynamoDbWrapper.test.ts` | `wrapper.queryItemsByUserId is not a function` | Test references a method that doesn't exist on `DynamoDBWrapper` |
| `test/integration/user-terminate-ec2-workflow.test.ts` | `Cannot read properties of undefined (reading 'length')` | `queryByStatus` mock not set up to return an array |
| `test/wrappers/ssmWrapper.test.ts` | `ParameterNotFound` rejection handling | aws-sdk-client-mock version issue with `.rejects()` |

### Node v25 Jest compatibility

Jest tests fail silently on Node v25 without `--localstorage-file`. Fixed by adding `NODE_OPTIONS='--localstorage-file=/tmp/jest-localstorage.json'` to the `test` script in `lambda/package.json`.

---

## Decisions Log

| # | Decision | Status | Notes |
|---|----------|--------|-------|
| 1 | AMI storage: DynamoDB Games table vs SSM per game | **Resolved — DynamoDB** | `amiId` stored directly in Games table |
| 2 | `ebsSnapshotId` fate | **Resolved — keep optional** | `ebsSnapshotId?` retained as optional field |
| 3 | Subnet selection | Pending (Phase 2) | Needs real subnet ID — use default VPC subnet via context or create NetworkStack |
| 4 | Per-game instance type | **Resolved — wired** | `minInstanceType` from Games table passed through to EC2 launch |
| 5 | RDP port 3389 | Remove for production (Phase 2) | Keep a CDK context flag to re-enable for debugging |

---

## File Change Index

Quick reference for which files are touched per phase.

| File | Phase |
|------|-------|
| `lambda/src/handlers/api.ts` | 1.2 |
| `lambda/src/handlers/user-deploy-ec2/deploy-ec2.ts` | 1.4 |
| `lambda/src/handlers/user-deploy-ec2/update-running-instances.ts` | 1.6 |
| `lambda/src/utils/ec2Wrapper.ts` | 1.9 |
| `cdk/stepfunctions/user-deploy-ec2/definition.asl.json` | 1.3 |
| `cdk/lambdas/deploy-ec2.config.ts` | 1.4, 1.8, 2.2 |
| `cdk/lib/constructs/api/api-gateway.ts` | 1.7 |
| `cdk/lib/constructs/iam/lambda-policies.ts` | 1.5, 2.3 |
| `cdk/lib/constructs/storage/dynamodb-tables.ts` | 1.1, 1.6 |
| `cdk/lib/constructs/compute/dcv-security-group.ts` | 2.4 |
| `cdk/lib/constructs/compute/lambda-functions.ts` | 2.2 |
| `cdk/lib/constructs/compute/lambda-types.ts` | 2.2 |
| `cdk/lib/compute-stack.ts` | 2.1, 2.2 |
| `cdk/cdk.json` | 2.5 |
