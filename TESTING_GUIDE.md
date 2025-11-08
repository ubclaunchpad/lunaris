# Step-by-Step Testing Guide for DeployInstance API

## Prerequisites Checklist

From the root directory
`npm run install:all`
`npm run docker:build`
`npm run docker:start`
`sam local start-api --port 3001`
Copy and paste the curl commands below in a separate terminal and test the results.
`npm run docker:stop`
`npm run docker:clean`

### Test 1: Valid Request

Open a new terminal and run:

```bash
curl -X POST http://localhost:3001/deployInstance \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "instanceType": "t3.micro",
    "amiId": "ami-0abcdef1234567890"
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Deployment workflow started successfully",
  "statusCode": 200
}
```

**What to check:**
- ✅ Status code is 200
- ✅ Response has `status: "success"`
- ✅ No error messages

---

### Test 2: Missing userId (Validation Test)

```bash
curl -X POST http://localhost:3001/deployInstance \
  -H "Content-Type: application/json" \
  -d '{
    "instanceType": "t3.micro",
    "amiId": "ami-0abcdef1234567890"
  }'
```

**Expected Response:**
```json
{
  "message": "User ID is required"
}
```

**What to check:**
- ✅ Status code is 400
- ✅ Error message is clear

---

### Test 3: Missing amiId (Validation Test)

```bash
curl -X POST http://localhost:3001/deployInstance \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "instanceType": "t3.micro"
  }'
```

**Expected Response:**
```json
{
  "message": "AMI ID is required"
}
```

**What to check:**
- ✅ Status code is 400
- ✅ Error message is clear

---

### Test 4: Default instanceType (Optional Field Test)

```bash
curl -X POST http://localhost:3001/deployInstance \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-456",
    "amiId": "ami-0abcdef1234567890"
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Deployment workflow started successfully",
  "statusCode": 200
}
```

**What to check:**
- ✅ Status code is 200
- ✅ Should use default `t3.micro` for instanceType

---

## Check SAM Local Logs

Look at the terminal where `sam local start-api` is running. You should see:

**For successful requests:**
```
START RequestId: xxx-xxx-xxx
[INFO] Started Step Function execution arn:aws:states:... for user test-user-123
END RequestId: xxx-xxx-xxx
```

**For validation errors:**
```
START RequestId: xxx-xxx-xxx
[ERROR] Validation failed: User ID is required
END RequestId: xxx-xxx-xxx
```

**What to look for:**
- ✅ No unexpected errors
- ✅ Log messages match what you expect
- ✅ Step Function execution ARN is logged (for successful requests)
