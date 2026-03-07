# NextAuth + Cognito OIDC Implementation

### 1. CDK Infrastructure Changes

**Modified Files:**

- `cdk/lib/constructs/auth/cognito-user-pool.ts` - Added OAuth/OIDC configuration
    - Added Cognito Domain for OAuth flows
    - Changed `generateSecret: true` for NextAuth compatibility
    - Added OAuth scopes (email, openid, profile)
    - Added callback URLs for NextAuth
    - Added new CDK outputs (domain, issuer)

- `cdk/bin/cdk.ts` - Enabled Cognito authorizer
    - Passed `userPool: authStack.userPool` to ApiStack

### 2. Frontend Authentication System

**New Files Created:**

- `frontend/auth.ts` - NextAuth configuration with Cognito provider
- `frontend/middleware.ts` - Global route protection middleware
- `frontend/app/api/auth/[...nextauth]/route.ts` - NextAuth API route handler
- `frontend/types/next-auth.d.ts` - TypeScript type extensions for NextAuth
- `frontend/.env.local.example` - Environment variables template

**Modified Files:**

- `frontend/app/login/page.tsx` - Replaced custom form with NextAuth signin
- `frontend/context/usercontext.tsx` - Integrated with NextAuth session
- `frontend/app/layout.tsx` - Added SessionProvider wrapper
- `frontend/lib/api-client.ts` - Added Authorization header with JWT token

**Dependencies Installed:**

- `next-auth@beta` - NextAuth v5 for Next.js 15
- `@aws-sdk/client-cognito-identity-provider` - AWS Cognito SDK

## 🚀 Deployment Instructions

### Step 1: Deploy CDK Stack

```bash
cd cdk
npm install
npm run deploy
```

**Note the following outputs:**

- `LunarisUserPoolId`
- `LunarisUserPoolClientId`
- `LunarisCognitoIssuer`
- `LunarisCognitoDomain`

### Step 2: Get Cognito Client Secret

**Option A: AWS Console**

1. Go to AWS Console → Cognito → User Pools
2. Select `lunaris-user-pool`
3. Go to "App Integration" tab
4. Click on `lunaris-web-client`
5. Click "Show client secret" and copy it

**Option B: AWS CLI**

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id <UserPoolId-from-CDK-output> \
  --client-id <ClientId-from-CDK-output> \
  --query 'UserPoolClient.ClientSecret' \
  --output text
```

### Step 3: Configure Frontend Environment

```bash
cd frontend

# Copy the example env file
cp .env.local.example .env.local

# Generate NextAuth secret
openssl rand -base64 32
```

Edit `frontend/.env.local` with your values:

```bash
# From CDK outputs
COGNITO_CLIENT_ID=<LunarisUserPoolClientId>
COGNITO_CLIENT_SECRET=<from step 2>
COGNITO_ISSUER=<LunarisCognitoIssuer>

# Generated secret
NEXTAUTH_SECRET=<from openssl command>

# Local development
NEXTAUTH_URL=http://localhost:3000

# From CDK outputs
NEXT_PUBLIC_API_GATEWAY_URL=<your-api-gateway-url>
```

### Step 4: Run Frontend

```bash
cd frontend
npm run dev
```

## 🧪 Testing the Authentication Flow

### 1. Test Route Protection

- Navigate to `http://localhost:3000`
- You should be redirected to `/login`
- All routes except `/login` and `/about` require authentication

### 2. Test Login Flow

- Click "Sign in with Cognito" button
- You'll be redirected to Cognito Hosted UI
- Create a new account or sign in with existing credentials
- After authentication, you'll be redirected back to `/browse`

### 3. Test Session Persistence

- Refresh the page - you should stay logged in
- Session is stored in httpOnly cookies (secure)

### 4. Test API Calls

- Open browser DevTools → Network tab
- Trigger an API call (e.g., deploy instance)
- Check the request headers - you should see `Authorization: Bearer <token>`

### 5. Test API Gateway Authorization

- API Gateway now validates JWT tokens
- Unauthenticated requests will return 401 Unauthorized

## 🔒 Security Features Implemented

✅ **httpOnly Cookies** - Tokens stored in httpOnly cookies, not localStorage
✅ **CSRF Protection** - Built into NextAuth
✅ **OAuth 2.0 + OIDC** - Industry-standard authentication
✅ **Global Route Protection** - Middleware enforces auth on all routes
✅ **Automatic Token Refresh** - NextAuth handles token refresh automatically
✅ **JWT Validation** - API Gateway validates tokens server-side
✅ **Secure Session Management** - Server-side session handling

## 📁 Architecture Overview

```
User
  ↓
  ├─ Browser (http://localhost:3000)
  │   ↓
  │   ├─ Middleware (checks auth)
  │   │   ↓
  │   ├─ Public routes (/login, /about) → Allow
  │   │   OR
  │   └─ Protected routes → Redirect to /login if not authenticated
  │
  ├─ /login page
  │   ↓
  │   Click "Sign in with Cognito"
  │   ↓
  ├─ Cognito Hosted UI (https://lunaris-auth-fleming.auth.us-west-2.amazoncognito.com)
  │   ↓
  │   User enters credentials
  │   ↓
  ├─ Callback to /api/auth/callback/cognito
  │   ↓
  │   NextAuth validates code, exchanges for tokens
  │   ↓
  │   Stores tokens in httpOnly cookies
  │   ↓
  └─ Redirect to /browse (or callbackUrl)

API Calls:
  Frontend → API Client
    ↓
    Gets session (includes idToken)
    ↓
    Adds Authorization: Bearer <idToken> header
    ↓
  API Gateway
    ↓
    Cognito Authorizer validates JWT
    ↓
    If valid → Lambda handler
    If invalid → 401 Unauthorized
```

## 🔧 Troubleshooting

### Issue: "Invalid redirect_uri"

**Solution:** Make sure your Cognito callback URL matches exactly:

- Check `cdk/lib/constructs/auth/cognito-user-pool.ts` line ~70
- Should include `http://localhost:3000/api/auth/callback/cognito`

### Issue: "Client secret not found"

**Solution:**

- Ensure `generateSecret: true` in cognito-user-pool.ts
- Redeploy CDK stack
- Get the new client secret from AWS Console

### Issue: "Session not persisting"

**Solution:**

- Check that `SessionProvider` wraps your app in `layout.tsx`
- Verify `NEXTAUTH_SECRET` is set in `.env.local`
- Clear browser cookies and try again

### Issue: "API returns 401 Unauthorized"

**Solution:**

- Check that `userPool` is passed to ApiStack in `cdk/bin/cdk.ts`
- Verify API client is sending Authorization header
- Check that idToken is in the session (open DevTools → Application → Cookies)

### Issue: TypeScript errors with Session type

**Solution:**

- Ensure `frontend/types/next-auth.d.ts` exists
- Restart TypeScript server in VS Code

## 📝 Next Steps (Optional Enhancements)

1. **Add Logout Functionality**
    - Create a logout button in Navbar
    - Call `signOut()` from next-auth/react

2. **Add User Profile Page**
    - Display user info from session
    - Allow profile updates

3. **Add Email Verification**
    - Configure Cognito email verification flow
    - Handle unverified users

4. **Add Password Reset**
    - Use Cognito forgot password flow
    - Create reset password page

5. **Add Social Login**
    - Configure Cognito Identity Providers (Google, Facebook)
    - Add social login buttons to login page

6. **Production Deployment**
    - Add production callback URLs to Cognito
    - Update `NEXTAUTH_URL` for production domain
    - Enable HTTPS enforcement

## 🎯 Key Files Reference

**CDK:**

- Auth config: `cdk/lib/constructs/auth/cognito-user-pool.ts`
- API integration: `cdk/bin/cdk.ts`

**Frontend:**

- NextAuth config: `frontend/auth.ts`
- Route protection: `frontend/middleware.ts`
- API client: `frontend/lib/api-client.ts`
- User context: `frontend/context/usercontext.tsx`
- Login page: `frontend/app/login/page.tsx`

---

**Implementation Complete! 🎉**
