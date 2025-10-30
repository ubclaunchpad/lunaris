# Lunaris

A cloud gaming platform built with AWS serverless architecture.

## Architecture

This project consists of:

- **Frontend**: Next.js application for the user interface
- **Lambda**: AWS Lambda functions for serverless backend logic
- **CDK**: Infrastructure as Code using AWS CDK

## Prerequisites

- **Node.js** 22.x or higher
- **npm** 9.x or higher
- **Docker Desktop** (for local Lambda testing)
- **AWS SAM CLI** (for local API Gateway simulation)
- **AWS CLI** (for deployment)

### Installing Docker Desktop

```bash
# Homebrew
brew install --cask docker

# Then start Docker Desktop
open -a Docker
```

### Installing AWS SAM CLI

```bash
# macOS (Homebrew)
brew install aws-sam-cli

# Verify installation
sam --version
```

## Setup

### 1. Install Dependencies

```bash
# Install Lambda dependencies
cd lambda && npm install && cd ..

# Install CDK dependencies
cd cdk && npm install && cd ..

# Install Frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Local Development with Docker

#### Build Lambda Docker Image

```bash
cd lambda
npm run docker:build
```

- Compiles TypeScript Lambda code (`npm run build`)
- Builds a Docker image using AWS Lambda base image (`public.ecr.aws/lambda/nodejs:22`)
- Tags the image as `lunaris-lambda`

#### Run Lambda Handler Locally

```bash
# Run with default handler (deployInstance)
npm run docker:run

# Or specify a different handler w/ format
docker run --rm -p 9000:8080 lunaris-lambda handlers/streamingLink.handler
docker run --rm -p 9000:8080 lunaris-lambda handlers/terminateInstance.handler
docker run --rm -p 9000:8080 lunaris-lambda handlers/user-deploy-ec2/check-running-streams.handler
```

#### Test Lambda Function

```bash
# In another terminal or Postman, invoke the Lambda
curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"userId":"test-user","instanceType":"g4dn.xlarge","region":"us-west-2"}'
```

### 3. Local Development with SAM

SAM Local provides a local API Gateway + Lambda environment:

```bash
# From project root
cd lambda && npm run build && cd ..

# Start local API Gateway
sam local start-api
```

Then test endpoints:
```bash
# Deploy Instance
curl -X POST http://localhost:3000/deployInstance \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","instanceType":"g4dn.xlarge","region":"us-west-2"}'

# Get Streaming Link
curl "http://localhost:3000/streamingLink?userId=user123"

# Terminate Instance
curl -X POST http://localhost:3000/terminateInstance \
  -H "Content-Type: application/json" \
  -d '{"instanceId":"i-1234567890abcdef0","userId":"user123"}'
```