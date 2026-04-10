# ADR 0001: Session Control Plane

Date: 2026-04-10
Status: Accepted

## Context

Lunaris provisions game sessions through Step Functions, tracks instance lifecycle in DynamoDB,
and returns DCV connection details to the Next.js frontend. The deployment and termination review
found that the control plane was functionally close, but the ownership boundaries between tables
and the frontend polling contract were implicit enough to cause stale "Instance Ready" UI.

The current product behavior is also important: the user-facing "terminate" action does not
destroy the EC2 session permanently. It stops the instance so the deploy flow can resume it later.

## Decision

### DynamoDB remains the current control-plane store

Keep DynamoDB as the source of truth for active session control-plane state in this implementation
wave. The access patterns are narrow and key-based:

- find the current tracked session for a user
- look up the tracked EC2 instance by `instanceId`
- fetch the latest DCV connection material for a session
- update state as Step Functions progress

This is a good fit for DynamoDB because the workflow is operational, not analytical. We do not
need relational joins or broad historical queries on the hot path.

### Keep `RunningInstances` and `RunningStreams` as separate tables for now

We are not collapsing the tables in this remediation wave. Instead, we are making ownership
explicit:

- `RunningInstances` is authoritative for lifecycle and workflow tracking:
  - `userId`
  - `instanceId`
  - `status`
  - `executionArn`
  - timestamps related to instance state
- `RunningStreams` is authoritative for connection material:
  - `streamingLink`
  - `dcvIp`
  - `dcvPort`
  - `dcvUser`
  - `dcvPassword`
  - session identifiers and related metadata

Any API that returns a connectable session must treat `RunningInstances` as the final authority on
whether the session is actually active. `RunningStreams` alone is not enough to prove a session is
connectable.

### Current product semantics: "terminate" means stop/resume

The current UX and workflow semantics are officially treated as stop/resume:

- user-facing termination stops the DCV session and EC2 instance
- a later deploy can resume that stopped instance
- `stopped` is therefore a valid, resumable inactive state
- `terminated` is reserved for non-resumable or no-instance cases

If the product later wants true destroy/recreate behavior, it should be introduced as a separate
workflow and user-facing action instead of changing the meaning of the current endpoint in place.

### Keep frontend polling keyed by `userId` for now

The frontend will keep polling `/deployment-status?userId=...` in the current release. This is an
intentional short-term decision to avoid wider client churn while the backend now persists the
active terminate execution onto the tracked instance record.

The working rule is:

- `RunningInstances.executionArn` must always point at the currently active workflow for that
  tracked session
- `/deployment-status` must follow that tracked execution

We are not switching the primary frontend contract to explicit `executionArn` polling yet, but
terminate responses now return `executionArn` so the system is better positioned for a future move.

### Event-driven updates are the preferred long-term direction

Polling is acceptable for the current release, but it is not the end state. The preferred future
direction is:

- Step Functions emits workflow state changes
- the backend fans those events out to the frontend
- the browser receives session status pushes instead of polling every few seconds

Until that exists, polling should stay scoped, short-lived, and tied to active user actions only.

## Consequences

### What this decision optimizes for

- low-risk remediation of the stale-session bugs
- minimal churn to the deployed frontend contract
- explicit ownership of workflow state versus connection data
- continued use of infrastructure already present in production

### Known tradeoffs

- two-table state still leaves room for drift without transactional writes
- userId-based polling is simpler but less precise than execution-specific polling
- DynamoDB rows will accumulate unless inactive rows are cleaned up or expired

## Follow-up guidance

The next architecture pass should revisit a single authoritative `Session` item when any of the
following become true:

- more than two writers regularly update session state
- historical session queries become a product requirement
- drift between tables becomes a recurring operational problem
- the frontend needs to track multiple concurrent workflows per user

That follow-up should evaluate:

- a single `Session` item keyed by session or user/session
- DynamoDB transactions for multi-record updates
- TTL on inactive records plus optional archival
- execution-specific polling or push-based delivery
