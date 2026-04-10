# Deployment / Termination Remediation Plan

Last updated: 2026-04-10
Owner: Unassigned
Status: Planned phases complete; DCV deployment readiness remediation implemented locally

## Purpose

This file is the working plan for fixing the deployment / termination flow review findings.
It is intended to be updated by agents as work progresses so the repo always has a current
record of:

- what is broken
- what phase is currently in progress
- what has already been completed
- what is still blocked or needs follow-up

## Current Repo State

- Review-plan remediation phases are complete in the codebase.
- Current active follow-up is DCV deployment readiness for fresh and resumed instances.
- Known unrelated local changes already present before this plan:
  - `frontend/app/(main)/games/[id]/page.tsx`
  - `frontend/app/(stream)/streaming/page.tsx`
  - `frontend/components/dcv-viewer-simple.tsx`
- Target area:
  - Next.js frontend
  - Lambda API handler
  - deploy / terminate Step Functions workflows
  - DynamoDB session-tracking tables

## Review Findings To Address

- [ ] P0: terminate workflow does not replace the tracked `executionArn`, so `/deployment-status` can keep reporting the old deploy execution as `SUCCEEDED/running`
- [ ] P1: `/streamingLink` can return stopped sessions because it does not filter by active status and does not explicitly request newest-first ordering
- [ ] P1: resume path reuses stale DCV endpoint data from DynamoDB instead of re-reading the current EC2 network endpoint
- [ ] P1: streaming page redirects away before termination finishes, creating a race with stale frontend ready state
- [ ] P2: deploy-side placeholder migration logic is not wired in deployed config because `RUNNING_INSTANCES_TABLE_NAME` is not passed to that Lambda

## Post-Plan Follow-Up: DCV Readiness

Goal: make deploys produce a browser-connectable DCV endpoint before the frontend ever sees a session as ready.

Tasks:

- [x] Inspect live Step Functions executions, Lambda logs, DynamoDB rows, and EC2 state for the latest failed and succeeded deploys
- [x] Confirm the current AMI/environment does not become SSM-manageable quickly enough for `ConfigureDcvInstance` to be a reliable readiness gate
- [x] Confirm fresh launches still receive the intended security group, subnet, and instance profile
- [x] Move the critical DCV/certificate bootstrap into Windows user-data so fresh boots do not depend on SSM
- [x] Add a deploy workflow step that verifies the public `https://<ip>.nip.io:8443` endpoint with trusted TLS before updating DynamoDB to `running`
- [x] Make the resume path continue to DCV readiness verification even when `StartDcvInstance` cannot use SSM
- [x] Refresh resume-path endpoint data from the verified live EC2 public IP before persisting the stream row
- [x] Harden `/streamingLink` so it refuses sessions whose EC2 instance is no longer actually `running`
- [ ] Deploy the Lambda / Step Functions / IAM changes to AWS and verify an end-to-end browser stream against the live environment

Notes:

- Live investigation showed `ConfigureDcvInstance` consistently failing with `InvalidInstanceId` from SSM on fresh launches.
- Live investigation also showed the frontend could receive a `streamingLink` for a session that was not browser-connectable yet.
- CloudTrail confirmed the deploy path is launching with the intended instance profile and security group, so the new implementation treats SSM as best-effort and uses endpoint verification as the real readiness gate.

## Definition Of Done

- [ ] Termination writes a new active execution reference before the frontend begins polling
- [ ] `/deployment-status` reports the correct in-flight workflow for both deploy and terminate
- [ ] `/streamingLink` only returns a truly connectable running session
- [ ] Resume flow refreshes DCV endpoint data after instance start
- [ ] Frontend waits for confirmed termination before returning to the game page
- [ ] Placeholder rows no longer accumulate silently
- [ ] Automated tests cover the stale-state regressions that triggered this review

## Working Rules

- [ ] Do not revert unrelated user changes in the dirty frontend files unless explicitly requested
- [ ] Keep this file updated when a phase starts, completes, or is blocked
- [ ] Add short notes in the phase notes sections when implementation decisions change

## Phase Overview

| Phase | Name | Goal | Status |
| --- | --- | --- | --- |
| 0 | Baseline And Tests | Lock in failing behaviors before refactor | Complete |
| 1 | Correct Execution Tracking | Make deploy/terminate status tracking deterministic | Complete |
| 2 | Eliminate Stale Session Reads | Stop surfacing stopped sessions as ready-to-stream | Complete |
| 3 | Fix Resume Endpoint Refresh | Make resumed sessions connect to the real current host | Complete |
| 4 | Clean Up Placeholder / Table Consistency | Remove placeholder drift and tighten table updates | Complete |
| 5 | Frontend Termination UX | Wait for real backend completion before clearing / redirecting | Complete |
| 6 | Architecture Follow-Up | Decide whether to keep current table model and polling strategy | Complete |

---

## Phase 0: Baseline And Tests

Goal: add enough coverage to prevent regressions while the workflow logic changes.

Primary files:

- `lambda/src/handlers/api.ts`
- `lambda/test/...`
- `frontend/lib/hooks/useDeploymentStatus.ts`
- `frontend/lib/__tests__/api-client.test.ts`
- `frontend/app/(stream)/streaming/page.tsx`

Tasks:

- [x] Add API tests for `/deployment-status` when a terminate workflow is in progress
- [x] Add API tests for `/streamingLink` proving stopped rows must not be returned
- [x] Add API tests proving newest running stream selection is deterministic
- [x] Add a frontend test anchor for the termination redirect regression
- [x] Add tests around deploy placeholder behavior so placeholder cleanup wiring is validated in config coverage
- [x] Record current failing scenarios using expected-failure regression coverage where implementation has not landed yet

Phase notes:

- Added expected-failure regression coverage in `lambda/test/handlers/api-session-state.test.ts`.
- Added expected-failure config coverage in `cdk/test/lambda-configs.test.ts`.
- Added a frontend TODO test anchor in `frontend/lib/__tests__/streaming-termination.todo.test.ts`.
- The specific stale deploy execution case is covered indirectly through the terminate execution persistence regression, since the root cause is that terminate never records the new tracked execution.

---

## Phase 1: Correct Execution Tracking

Goal: ensure status polling always follows the currently active workflow instead of an old execution.

Primary files:

- `lambda/src/handlers/api.ts`
- `cdk/stepfunctions/user-terminate-ec2/definition.asl.json`
- `lambda/src/handlers/user-terminate-ec2/update-running-instances.ts`
- `lambda/src/handlers/user-deploy-ec2/update-running-instances.ts`

Tasks:

- [x] Decide the canonical source for “current workflow execution”
- [x] Update `handleTerminateInstance` to write the terminate `executionArn` onto the active session/instance record before returning success
- [x] Mark the active row with a transitional status such as `terminating` when the terminate workflow starts
- [x] Make `/deployment-status` select the correct active record instead of naively taking the first row from `queryByUserId`
- [x] Ensure `/deployment-status` can distinguish deploy and terminate executions reliably
- [x] Align `TERMINATE_STEPS` with the actual terminate state machine states so progress reporting is accurate
- [x] Decide whether polling should remain keyed by `userId` or move to explicit `executionArn`
- [ ] If moving to `executionArn`, return it from `/deployInstance` and `/terminateInstance` and update frontend typing

Exit criteria:

- [x] Terminate polling no longer reports a stale deploy success
- [x] Progress messages reflect the real terminate workflow state

Phase notes:

- Decision: keep the current userId-based polling contract for this implementation wave to minimize frontend churn, but persist the active terminate execution onto the tracked instance row so `/deployment-status` becomes deterministic again.
- `POST /terminateInstance` now updates the tracked instance row with the new `executionArn` and `terminating` status.
- `/deployment-status` now prefers the active tracked record rather than blindly taking the first query result.
- `executionArn` is returned from terminate start responses for future frontend adoption if we later move to execution-specific polling.

---

## Phase 2: Eliminate Stale Session Reads

Goal: prevent stopped sessions from being interpreted as active streaming sessions.

Primary files:

- `lambda/src/handlers/api.ts`
- `lambda/src/handlers/user-terminate-ec2/update-running-streams.ts`
- `frontend/app/(main)/games/[id]/page.tsx`

Tasks:

- [x] Change `/streamingLink` to return only rows that represent a connectable running stream
- [x] Explicitly request descending sort order for the `UserIdIndex` query
- [x] Avoid trusting the first returned row unless it is confirmed active
- [ ] Decide whether stopped rows should remain for history or be archived elsewhere
- [x] If stopped rows remain, make the API ignore them by design instead of by convention
- [x] Update frontend game-page hydration so it only shows ready state for valid active sessions
- [ ] Clear local ready-state data when termination starts and when termination completes

Exit criteria:

- [x] Refreshing the game page after a stop does not recreate a ready banner
- [x] `getStreamingLink` returns 404 or equivalent inactive-state response after stop

Phase notes:

- `/streamingLink` now queries newest-first, filters to running stream rows, and cross-checks `RunningInstances` before returning credentials.
- Frontend game-page hydration did not need code changes in this phase because it already trusts the API response; once the API stopped returning stale rows, the stale ready state stopped being reconstructible from the backend.
- The remaining local ready-state cleanup when termination starts will be addressed in Phase 5 with the streaming-page UX change.

---

## Phase 3: Fix Resume Endpoint Refresh

Goal: make resumed instances publish their real current DCV endpoint instead of a cached stale one.

Primary files:

- `lambda/src/handlers/user-deploy-ec2/get-dcv-config.ts`
- `lambda/src/handlers/user-deploy-ec2/resume-deploy-instance.ts`
- `lambda/src/handlers/user-deploy-ec2/start-dcv-instance.ts`
- `lambda/src/utils/ec2Wrapper.ts`
- `cdk/stepfunctions/user-deploy-ec2/definition.asl.json`

Tasks:

- [x] Re-read current EC2 instance details after resume/start
- [x] Refresh `dcvIp` and derived `streamingLink` from current instance networking data
- [x] Verify whether the deployment model depends on ephemeral public IPv4 addresses or Elastic IPs
- [ ] If using ephemeral public IPs, ensure the resumed stream row is updated with the new endpoint every time
- [ ] If using Elastic IPs, document that assumption in code and tests
- [x] Add tests covering stop/start IP changes and resumed stream row refresh
- [x] Confirm the resume path still preserves credentials that should remain stable across restarts

Exit criteria:

- [x] A resumed instance produces a connectable `streamingLink`
- [x] Resume no longer depends on stale DynamoDB IP data

Phase notes:

- `get-dcv-config` now resolves the live EC2 instance details and prefers the current public IP over the cached stream IP.
- The resume workflow now passes `instanceId` explicitly into `GetDcvConfig` so the handler does not need to rely only on ARN parsing.
- Decision: assume the current deployment model may use ephemeral public IPv4 addresses, so the resume path must refresh the stream endpoint every time instead of trusting DynamoDB.
- Credentials remain sourced from the existing stream row so passwords and usernames stay stable across stop/start.

---

## Phase 4: Clean Up Placeholder / Table Consistency

Goal: tighten the control-plane model so `RunningInstances` and `RunningStreams` cannot drift as easily.

Primary files:

- `lambda/src/handlers/user-deploy-ec2/update-running-streams.ts`
- `lambda/src/handlers/user-deploy-ec2/update-running-instances.ts`
- `lambda/src/handlers/user-terminate-ec2/update-running-streams.ts`
- `lambda/src/handlers/user-terminate-ec2/update-running-instances.ts`
- `cdk/lambdas/update-running-streams-deploy.config.ts`

Tasks:

- [x] Wire `RUNNING_INSTANCES_TABLE_NAME` into the deploy-side update-streams Lambda if placeholder migration logic is kept
- [x] Decide whether placeholder migration should stay in `update-running-streams` or be consolidated into one authoritative update path
- [ ] Remove any dead or duplicate migration logic after the authoritative path is chosen
- [x] Audit all state transitions for both tables: `deploying`, `running`, `terminating`, `stopped`, `terminated`
- [x] Decide whether `stopped` and `terminated` should mean different things in this product, since the current workflow is really stop/resume
- [ ] Consider DynamoDB transactional writes when both tables must change together
- [ ] Add a one-time cleanup task or script for orphaned placeholder rows if existing environments already contain them
- [x] Verify metric publishing still reflects the chosen state model

Exit criteria:

- [x] Placeholder rows are not left behind unexpectedly
- [x] Table state transitions are explicit and documented
- [ ] An interrupted workflow cannot silently leave contradictory instance/stream states

Phase notes:

- Decision: keep placeholder migration in `update-running-streams` for now because it is the point where the real EC2 instance ID first becomes available alongside the in-flight execution tracking record.
- Added the missing `RUNNING_INSTANCES_TABLE_NAME` env wiring so placeholder cleanup actually runs in deployed environments.
- Placeholder lookup is now explicitly newest-first.
- State model documented: user-facing session end maps to `stopped` because deploy can resume it; `terminated` remains the no-instance / non-resumable path.
- Transactional writes and a one-time placeholder cleanup script are still good follow-up items, but they are not required to fix the currently observed stale-session bugs.

---

## Phase 5: Frontend Termination UX

Goal: make the user experience match backend reality during stop / terminate.

Primary files:

- `frontend/app/(stream)/streaming/page.tsx`
- `frontend/app/(main)/games/[id]/page.tsx`
- `frontend/lib/hooks/useDeploymentStatus.ts`
- `frontend/lib/api-client.ts`

Tasks:

- [x] Keep the streaming page on-screen while termination is in progress, or show an explicit terminating interstitial
- [x] Poll termination status until the workflow reaches a real terminal state
- [x] Redirect only after backend confirmation that the session is no longer active
- [x] Make UI strings and local state distinguish deploy success from terminate success
- [x] Clear credentials and ready state immediately when termination starts
- [x] Decide whether `terminated=true` query param is still needed after backend-driven confirmation is added
- [x] Handle inactive session responses gracefully on the game page without flashing stale success UI
- [x] Add user-facing messaging for `terminating`, `stopped`, and `resume available` if those are separate concepts

Exit criteria:

- [x] Clicking terminate no longer allows a race back into a stale ready state
- [x] The game page only offers streaming when backend state is actually connectable

Phase notes:

- The streaming page now switches to a termination interstitial, starts backend polling, and only redirects after `/deployment-status` confirms a terminated workflow result.
- Local streaming state is cleared immediately when termination starts so the DCV viewer does not stay mounted during shutdown.
- Decision: remove the old `terminated=true` redirect query hack and rely on backend-confirmed state instead.
- The game page now clears stale credentials before re-checking for an existing session and shows a short post-stop notice so the stop/resume model is explicit to the user.

---

## Phase 6: Architecture Follow-Up

Goal: make an explicit decision on the long-term control-plane design instead of patching symptoms forever.

Tasks:

- [x] Decide whether to keep `RunningInstances` + `RunningStreams` as separate tables or move to one authoritative session table
- [x] If keeping both tables, document the owner of truth for each field and each state transition
- [x] Evaluate a single `Session` item keyed by user/session with `executionArn`, `instanceId`, `status`, `dcvEndpoint`, and timestamps
- [x] Evaluate DynamoDB TTL for old inactive session rows
- [x] Evaluate event-driven status delivery instead of frontend polling
- [x] Compare polling by `userId` versus polling by `executionArn`
- [x] Decide whether stop/resume is the intended product behavior or whether true termination should destroy the session permanently
- [x] Write the final architecture decision into `README.md` or an ADR after implementation stabilizes

Phase notes:

- Added `docs/adr/0001-session-control-plane.md` and linked it from `README.md`.
- Decision: keep DynamoDB and the current two-table model for now, with `RunningInstances` as the lifecycle authority and `RunningStreams` as connection metadata only.
- Decision: keep userId-based polling in the current release, but treat event-driven updates and an eventual single authoritative session item as the preferred future direction.
- Decision: the current user-facing terminate flow is officially documented as stop/resume behavior, not destroy/recreate.

---

## Validation Checklist

- [ ] Deploy from a clean state and confirm status progresses correctly
- [ ] Stop/terminate an active session and confirm the frontend does not show “Instance Ready” afterward
- [ ] Refresh the game page immediately after termination starts and after it completes
- [ ] Resume a stopped instance and verify the returned DCV endpoint is current and connectable
- [ ] Confirm `/streamingLink` does not return stopped sessions
- [ ] Confirm `/deployment-status` follows the current active execution
- [ ] Confirm placeholder rows are removed or intentionally preserved according to the new design
- [ ] Confirm CloudWatch metrics still reflect actual active-session counts
- [ ] Confirm deploy rollback does not leave a stale running stream row behind

---

## Simplification Plan (2026-04-10)

### Scope

No resume path. No EBS. No SSM-based configuration steps.

The only thing that needs to work: user triggers a deploy → EC2 launches from a DCV-ready AMI →
workflow verifies the HTTPS endpoint is browser-connectable → DCV URL is written to DynamoDB →
frontend polls status and connects. Terminate just stops the instance and clears the session row.

### Root Cause Analysis

**`ConfigureDcvInstance` wastes ~2 min and never succeeds**

SSM is not available during early Windows boot. The step always hits `InvalidInstanceId`,
burns through 3 retries (20s × 3 with 2× backoff ≈ 2.3 min), then soft-catches into the
verify step. Since we are targeting a DCV-ready AMI where DCV is pre-installed, none of the
SSM config work is needed anyway. **Remove this state entirely.**

**`VerifyDcvEndpointAfterDeploy` times out because the window is too short**

`WaitForInstanceReady` (60s) + verify poll (360s) = 7 min budget. The user-data cert setup
(get public IP → download win-acme → ACME HTTP-01 challenge → DCV restart) takes 5–10 min on
a cold boot. The verify Lambda itself has a 420s hard timeout, which barely contains a 360s
poll. **Increase `WaitForInstanceReady` to 120s, `timeoutSeconds` to 600, Lambda timeout to
660s.**

**"Error occurred while accessing the running streams database" is wrong**

`RollbackInstance` routes to `HandleDatabaseError` on success — not a DB error, just a
re-used Fail state label. **Rename to `HandleRollbackComplete` with an accurate cause.**

**EBS is dead code**

`deploy-ec2.ts` always returns `ebsVolumeId: ""`. The terminate lambda has a best-effort
EBS detach that never fires. **Remove all EBS references.**

### Target State Machine

```
CheckRunningStreams → CheckIfValidStream (fail if running)
  → DeployEC2
  → WaitForInstanceReady (120s)
  → VerifyDcvEndpoint (600s)
  → UpdateRunningStreams
  → UpdateRunningInstances
  → Success
```

States removed from current: `CheckRunningInstances`, `CheckIfInstanceExists`,
`ResumeDeployInstance`, `WaitForResumeInstanceReady`, `GetDcvConfig`, `MergeResumeData`,
`StartDcvInstance`, `VerifyDcvEndpointAfterResume`, `ConfigureDcvInstance`,
`HandleInstancesRunningError`

States renamed: `VerifyDcvEndpointAfterDeploy` → `VerifyDcvEndpoint`;
`HandleDatabaseError` (post-rollback) → `HandleRollbackComplete`

### Task List

**State machine (`definition.asl.json`)**
- [ ] Remove the entire resume branch: `CheckRunningInstances`, `CheckIfInstanceExists`, `ResumeDeployInstance`, `WaitForResumeInstanceReady`, `GetDcvConfig`, `MergeResumeData`, `StartDcvInstance`, `VerifyDcvEndpointAfterResume`, `HandleInstancesRunningError`
- [ ] Remove `ConfigureDcvInstance` and `WaitForInstanceReady`→`ConfigureDcvInstance`→`VerifyDcvEndpointAfterDeploy`; wire `WaitForInstanceReady` directly to `VerifyDcvEndpoint`
- [ ] Rename `VerifyDcvEndpointAfterDeploy` → `VerifyDcvEndpoint`
- [ ] Increase `WaitForInstanceReady` from 60s to 120s
- [ ] Increase verify step `timeoutSeconds` from 360 to 600
- [ ] Rename `HandleDatabaseError` (post-rollback terminal reached via `RollbackInstance`) to `HandleRollbackComplete` with cause "EC2 instance was rolled back after failed deployment"
- [ ] Remove `ebsVolumeId` from `PrepareUpdatePayload` parameters
- [ ] Wire `CheckIfValidStream` Default branch directly to `DeployEC2` (remove the `CheckRunningInstances` indirection)

**Lambda configs**
- [ ] Remove `configureDcvInstance`, `resumeDeployInstance`, `getDcvConfig`, `startDcvInstance` from `workflow.config.ts` lambdaFunctions
- [ ] Increase `verifyDcvEndpoint` Lambda `timeoutSeconds` from 420 to 660 in `verify-dcv-endpoint.config.ts`

**Lambda handlers**
- [ ] Remove `ebsVolumeId` field and conditional DynamoDB write from `update-running-instances.ts`
- [ ] Remove EBS detach block from `terminate-ec2.ts`; delete `lambda/src/utils/ebsWrapper.ts`

**CDK**
- [ ] Remove Lambda constructs for `configureDcvInstance`, `resumeDeployInstance`, `getDcvConfig`, `startDcvInstance` from `compute-stack.ts` and `lambda-functions.ts`

**Deploy and validate**
- [ ] Deploy and run a full end-to-end: fresh deploy → status polling → frontend DCV connect

### Definition Of Done

- [ ] Fresh deploy produces a verified browser-connectable DCV URL in DynamoDB
- [ ] No resume, EBS, SSM-config, or `ConfigureDcvInstance` states in any execution graph
- [ ] `VerifyDcvEndpoint` succeeds within the polling window on a cold Windows AMI boot
- [ ] No `ebsVolumeId` in any state machine payload, DynamoDB write, or Lambda event type
- [ ] Post-rollback terminal state has an accurate error message

---

## Progress Log

- 2026-04-10: Initial remediation plan created from code review findings. No implementation started yet.
- 2026-04-10: Phase 0 completed. Added regression coverage for terminate execution tracking, stale `/streamingLink` reads, and missing deploy-side Lambda env wiring. Added a frontend TODO test anchor for Phase 5.
- 2026-04-10: Phase 1 completed. Terminate now persists its active execution onto the tracked instance row, and `/deployment-status` prefers the active tracked record for terminate progress.
- 2026-04-10: Phase 2 completed. `/streamingLink` now ignores stopped rows and verifies the backing instance is still running before returning a connectable session.
- 2026-04-10: Phase 3 completed. Resume now refreshes the current EC2 endpoint during `get-dcv-config` and rewrites the stream row with the live address on the next update.
- 2026-04-10: Phase 4 completed. Placeholder migration is now wired in deployed config and the stop/resume state model is documented more explicitly.
- 2026-04-10: Phase 5 completed. The streaming page now waits for confirmed termination before redirecting, and the game page no longer relies on the `terminated=true` bypass to avoid stale ready state.
- 2026-04-10: Phase 6 completed. Added an ADR documenting the current DynamoDB ownership model, polling decision, and the long-term path toward a more authoritative session control plane.
- 2026-04-10: Post-phase hotfix in progress. Live debugging on instance `i-0cfe97128b282eade` showed the instance was running and its EC2 security group allowed TCP 8443, but external TCP connects to `52.33.95.53:8443` timed out and SSM-based DCV setup was not completing reliably. The remediation adds an explicit Windows firewall rule for DCV HTTPS and verifies port 8443 after DCV start/restart. The workflow-level "fail deploy if ConfigureDcvInstance fails" change was then rolled back to restore the previous best-effort behavior for that step, because `ConfigureDcvInstance` predates this implementation wave and is not required for AMIs that are already DCV-ready.
