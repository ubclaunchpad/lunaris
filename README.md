# Lunaris

A cloud gaming platform built with AWS serverless architecture.

## Architecture

This project consists of:

- **Frontend**: Next.js application for the user interface
- **Lambda**: AWS Lambda functions for serverless backend logic
- **CDK**: Infrastructure as Code using AWS CDK
- **Step Functions**: Workflow orchestration for complex operations

## Local Development with SAM CLI

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) - Required for local services
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) - Required for local AWS services
- [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) - Required for local Lambda and API Gateway

### Quick Start

#### 1. Build Lambda Functions

```bash
cd lambda
npm run build
cd ..
```

#### 2. Start Local Services

**Start DynamoDB Local:**

```bash
# Start DynamoDB in Docker
docker run -d --name dynamodb-local -p 8000:8000 amazon/dynamodb-local:latest -jar DynamoDBLocal.jar -sharedDb -inMemory

# Create tables
aws dynamodb create-table --endpoint-url http://localhost:8000 --table-name RunningInstances --attribute-definitions AttributeName=instanceId,AttributeType=S AttributeName=status,AttributeType=S AttributeName=creationTime,AttributeType=S --key-schema AttributeName=instanceId,KeyType=HASH --global-secondary-indexes IndexName=StatusCreationTimeIndex,KeySchema=[{AttributeName=status,KeyType=HASH},{AttributeName=creationTime,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

aws dynamodb create-table --endpoint-url http://localhost:8000 --table-name RunningStreams --attribute-definitions AttributeName=instanceArn,AttributeType=S --key-schema AttributeName=instanceArn,KeyType=HASH --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

**Start API Gateway:**

```bash
sam local start-api
```

## Common SAM CLI Commands

### API Gateway

**Note: The `samconfig.toml` file provides defaults for host (0.0.0.0), port (3000), warm containers, debug settings, and all environment variables.**

**API Endpoints (when running):**

- POST http://localhost:3000/deployInstance
- POST http://localhost:3000/terminateInstance
- GET http://localhost:3000/streamingLink?userId=<userId>

### Lambda Function Testing

**Invoking an individual Lambda function:**
```bash
sam local invoke {lambda-name}
```

**Invoking an individual Lambda function with a payload:**

Make sure to add the properly formatted payload in the `events/` directory first.
```bash
same local invoke {lambda-name} --event events/{lambda-name}.json
```

**DeployInstanceFunction:**

```bash
sam local invoke DeployInstanceFunction --event events/deploy-instance.json
```

## Event Payloads

Create these JSON files in the `events/` directory for Lambda testing:

**events/streaming-link.json:**

```json
{
  "httpMethod": "GET",
  "path": "/streamingLink",
  "queryStringParameters": {
    "userId": "test-user-123"
  },
  "headers": {
    "Content-Type": "application/json"
  }
}
```

**events/deploy-instance.json:**

```json
{
  "body": "{\"userId\":\"test-user-123\",\"instanceType\":\"t3.micro\",\"amiId\":\"ami-0abcdef1234567890\"}",
  "httpMethod": "POST",
  "path": "/deployInstance",
  "headers": {
    "Content-Type": "application/json"
  }
}
```

## Testing Examples

### Test API Endpoints

```bash
# Test deploy instance
curl -X POST http://localhost:3000/deployInstance \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","instanceType":"t3.micro","amiId":"ami-12345"}'

# Test streaming link
curl "http://localhost:3000/streamingLink?userId=test-user"

# Test terminate instance
curl -X POST http://localhost:3000/terminateInstance \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","instanceId":"i-12345"}'
```

### View DynamoDB Data

```bash
# List tables
aws dynamodb list-tables --endpoint-url http://localhost:8000

# Scan RunningInstances table
aws dynamodb scan --table-name RunningInstances --endpoint-url http://localhost:8000

# Scan RunningStreams table
aws dynamodb scan --table-name RunningStreams --endpoint-url http://localhost:8000
```

## Cleanup Commands

**Stop all services:**

```bash
# Stop DynamoDB
docker stop dynamodb-local && docker rm dynamodb-local

# Stop Step Functions
docker stop stepfunctions-local && docker rm stepfunctions-local

# Stop API Gateway (Ctrl+C in terminal where it's running)
```