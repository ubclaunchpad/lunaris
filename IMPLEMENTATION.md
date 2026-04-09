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

### 1.1 Add `amiId` to the Games DynamoDB table schema

**Decision required:** Store AMI ID directly in the DynamoDB `Games` table (recommended — simpler than SSM per game).

- [ ] Add `amiId: string` field to `GameItem` interface in `lambda/src/handlers/api.ts`
- [ ] Decide fate of `ebsSnapshotId` field — remove it or keep as optional for EBS-based approaches
- [ ] Update `dynamodb-tables.ts` schema comment to document the `amiId` field
- [ ] Update `GameItem` type used in any other lambda handlers referencing game records

### 1.2 Update API deploy endpoint to accept and validate `gameId`

Files: `lambda/src/handlers/api.ts`

- [ ] Add `gameId: string` to the `DeployInstanceRequest` interface
- [ ] In `handleDeployInstance`, validate `gameId` is present in the request body (return 400 if missing)
- [ ] Perform a DynamoDB `GetItem` on the `Games` table using `gameId` to fetch `amiId` and `minInstanceType`
- [ ] Return 404 if `gameId` is not found in the Games table
- [ ] Return 400 if the game record is missing `amiId`
- [ ] Add `GAMES_TABLE_NAME` env var read to the deploy handler (it's set on the Lambda but not read in this path)
- [ ] Pass `{ userId, gameId, amiId, instanceType }` as the Step Function input (currently only `{ userId }`)

### 1.3 Thread `gameId` and `amiId` through the deploy Step Function

File: `cdk/stepfunctions/user-deploy-ec2/definition.asl.json`

- [ ] Update `DeployEC2` state Payload to include `"gameId.$": "$.gameId"` and `"amiId.$": "$.amiId"` and `"instanceType.$": "$.instanceType"`
- [ ] Update `ResumeDeployInstance` state Payload to forward `gameId` (resume path)
- [ ] Update `MergeResumeData` Pass state Parameters to include `gameId` from resume path
- [ ] Update `PrepareUpdatePayload` Pass state to include `gameId` so it reaches `UpdateRunningInstances`
- [ ] Update `UpdateRunningInstances` state Payload to include `"gameId.$": "$.updatePayload.gameId"`

### 1.4 Update `deploy-ec2` lambda to use `amiId` from event

File: `lambda/src/handlers/user-deploy-ec2/deploy-ec2.ts`

- [ ] Add `gameId`, `amiId`, `instanceType` fields to the `DeployEc2Event` type
- [ ] Remove the SSM parameter lookup (`ssmWrapper.getParamFromParamStore("ami_id")`) — use `event.amiId` directly
- [ ] Pass `instanceType` from event to `EC2InstanceConfig` (currently hardcoded or defaulted in ec2Wrapper)
- [ ] Add EC2 tag `GameId: event.gameId` to the instance tags at launch
- [ ] Remove `SSMWrapper` import if no longer needed by this handler
- [ ] Update `deploy-ec2.config.ts`: remove `BASE_EBS_SNAPSHOT_ID` from `envVars` (unused); remove SSM policy dependency if applicable

### 1.5 Remove per-game SSM AMI lookup policy (if AMI comes from DynamoDB)

File: `cdk/lib/constructs/iam/lambda-policies.ts`

- [ ] Remove or narrow the `ssm:GetParameter` policy in `getDeployEC2Policies()` — the `/ami_id` SSM parameter is no longer needed if `amiId` comes from the Games DynamoDB table via the API handler
- [ ] If SSM is retained for other purposes, update the resource ARN to the correct path

### 1.6 Store `gameId` in the `RunningInstances` table

Files: `lambda/src/handlers/user-deploy-ec2/update-running-instances.ts`

- [ ] Add `gameId` to the event/input type in `update-running-instances.ts`
- [ ] Add `gameId` as an attribute in the DynamoDB `PutItem` / `UpdateItem` call
- [ ] Update `dynamodb-tables.ts` schema comment to document `gameId` column

### 1.7 Register `/games` and `/games/{gameId}` in API Gateway

File: `cdk/lib/constructs/api/api-gateway.ts`

- [ ] Add `{ path: "games", method: "GET", statusCodes: ["200"], noAuth: true }` to `ENDPOINTS`
- [ ] Add `{ path: "games/{gameId}", method: "GET", statusCodes: ["200", "404"], noAuth: true }` to `ENDPOINTS`
- [ ] Verify path parameter routing works with the existing Lambda proxy setup

### 1.8 Add `GAMES_TABLE_NAME` to `deploy-ec2.config.ts` env vars

File: `cdk/lambdas/deploy-ec2.config.ts`

- [ ] Add `"GAMES_TABLE_NAME"` to the `envVars` array (needed if the deploy lambda does its own game lookup; remove if lookup stays in the API handler)

### 1.9 Update `ec2Wrapper.ts` to support `instanceType`

File: `lambda/src/utils/ec2Wrapper.ts`

- [ ] Add optional `instanceType?: string` field to `EC2InstanceConfig`
- [ ] Use `instanceType` in the `RunInstances` call if provided, otherwise keep existing default

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

## Decisions Log

| # | Decision | Status | Notes |
|---|----------|--------|-------|
| 1 | AMI storage: DynamoDB Games table vs SSM per game | **DynamoDB recommended** | Store `amiId` directly in Games table; simpler, avoids SSM parameter proliferation |
| 2 | `ebsSnapshotId` fate | Pending | Keep as optional field for potential EBS-based approaches, or remove if not needed |
| 3 | Subnet selection | Pending | Needs real subnet ID — use default VPC subnet via context or create NetworkStack |
| 4 | Per-game instance type | Use `minInstanceType` from Games table | Already in `GameItem`, just needs to be wired through |
| 5 | RDP port 3389 | Remove for production | Keep a CDK context flag to re-enable for debugging |

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
