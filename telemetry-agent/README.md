# Lunaris Telemetry Agent

EC2 usage telemetry agent that emits `SessionActiveMinute` metrics to CloudWatch when a DCV session is active.

## Setup

```bash
cd telemetry-agent
npm install
npm run build
```

## Run (local / dev)

Mock DCV as active and override InstanceId:

```bash
INSTANCE_ID=i-local-test USER_ID=user-123 SESSION_ID=user-user-123-session DCV_SESSION_ACTIVE=true AWS_REGION=us-west-2 npm run start
```

Single tick (for cron):

```bash
INSTANCE_ID=i-local-test USER_ID=user-123 SESSION_ID=user-user-123-session DCV_SESSION_ACTIVE=true npm run tick
```

## Run on EC2

- `INSTANCE_ID` is fetched from IMDS automatically
- `USER_ID` and `SESSION_ID` must be injected via user-data at launch
- `DCV_SESSION_ACTIVE` is for dev only; on EC2, real DCV detection will be used

## Env vars

| Var | Required | Description |
|-----|----------|-------------|
| `INSTANCE_ID` | No (EC2) | Override IMDS; used for local dev |
| `USER_ID` | Yes | User identifier |
| `SESSION_ID` | Yes | Session identifier (e.g. `user-{userId}-session`) |
| `DCV_SESSION_ACTIVE` | No | `true`/`false` to mock DCV (dev only) |
| `AWS_REGION` | No | Defaults to `us-west-2` |

## Scheduling on EC2

**Option A: Cron (every minute)**

```cron
* * * * * cd /path/to/agent && INSTANCE_ID=... USER_ID=... SESSION_ID=... node dist/index.js --once
```

**Option B: systemd timer**

Create a timer that runs every 60 seconds, or a service with `ExecStart` that loops (current default behavior).
