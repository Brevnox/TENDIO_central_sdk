# TendioCentral SDK Integration Guide

**Package:** `@justinmcadoo/tendiocentral-sdk`
**Current Version:** 1.2.0
**Requires:** Node.js 18+, Express 4.x or 5.x, express-session

---

## Quick Start

Get a working login flow in 5 steps. This covers only the basics — see the detailed sections below for webhooks, role guards, and more.

**Step 1: Install the package**

```bash
npm install @justinmcadoo/tendiocentral-sdk
```

**Step 2: Set environment variables**

You only need three variables to get started. The SDK figures out the TendioCentral server URL automatically based on `NODE_ENV`, so you don't need to configure it.

```env
NODE_ENV=development
TENDIOCENTRAL_CLIENT_ID=your-client-id
TENDIOCENTRAL_CLIENT_SECRET=your-client-secret
```

**Step 3: Initialize the SDK**

Create an `auth.ts` file that sets up the SDK with your credentials and the URL where TendioCentral will send users back after they log in.

```typescript
import { TendioAuth } from '@justinmcadoo/tendiocentral-sdk/express';

let auth: Awaited<ReturnType<typeof TendioAuth.fromConfig>>;

export async function initializeAuth() {
  auth = await TendioAuth.fromConfig({
    clientSecret: process.env.TENDIOCENTRAL_CLIENT_SECRET!,
    redirectUri: 'https://your-app.com/auth/callback',
  });
  return auth;
}

export function getAuth() {
  if (!auth) throw new Error('Auth not initialized');
  return auth;
}
```

**Step 4: Mount the routes and start the app**

Three routes handle the entire login flow: one to send users to TendioCentral to log in, one to receive them back after login (the "callback"), and one to log them out.

Add `SESSION_SECRET` to your `.env` — generate one by running this in your terminal:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

```typescript
import express from 'express';
import session from 'express-session';
import { initializeAuth, getAuth } from './auth';

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
}));

app.get('/login', (req, res, next) => getAuth().initiateLogin()(req, res, next));

app.get('/auth/callback', (req, res, next) => {
  getAuth().handleCallback()(req, res, (err) => {
    if (err) return res.redirect('/?error=login_failed');
    res.redirect('/');
  });
});

app.post('/logout', (req, res, next) => getAuth().logout()(req, res, next));

async function main() {
  await initializeAuth();
  app.listen(3000, () => console.log('Running on http://localhost:3000'));
}

main();
```

**Step 5: Trigger login from your frontend**

```typescript
window.location.href = '/login';
```

**What's next?** This gets you a working login. For webhook handling, role-based access control, automatic token refresh, user sync, and lifecycle hooks (like linking SSO users to existing accounts), see the detailed sections below.

---

## 1. Installation

```bash
npm install @justinmcadoo/tendiocentral-sdk
```

The SDK has two import paths depending on your use case:

- `@justinmcadoo/tendiocentral-sdk/express` — use this in most cases. It includes the Express middleware (initiateLogin, handleCallback, logout, etc.) and everything from the core path.
- `@justinmcadoo/tendiocentral-sdk` — use this if you are not using Express and need only the core auth logic, types, and webhook verification.

If you are building an Express app, import from the `/express` path.

---

## 2. Environment Variables

Set the following environment variables in your application:

| Variable | Required | Auto-read by SDK | Description |
|---|---|---|---|
| `TENDIOCENTRAL_CLIENT_ID` | Yes | Yes | Your app's client ID |
| `TENDIOCENTRAL_CLIENT_SECRET` | Yes | No | Your app's client secret — must be passed as `clientSecret` in config |
| `TENDIOCENTRAL_URL` | No | Yes | TendioCentral server URL — only needed if pointing at a custom instance (see auto-resolution below) |
| `TENDIOCENTRAL_REDIRECT_URI` | Yes | No | The OAuth callback URL — must be passed as `redirectUri` in config |
| `TENDIOCENTRAL_WEBHOOK_SECRET` | No | Yes | Secret for verifying webhook payloads |
| `ENVIRONMENT` | No | No | `development`, `staging`, or `production` (defaults to `production`) — pass as `environment` in config |
| `NODE_ENV` | No | Yes | Used to auto-resolve the TendioCentral URL (see below) |
| `SESSION_SECRET` | Yes | No | Secret for express-session (not SDK-related, used by your session middleware) |

**Auto-read variables:** `TENDIOCENTRAL_CLIENT_ID`, `TENDIOCENTRAL_WEBHOOK_SECRET`, and `NODE_ENV` are automatically read from `process.env` by the SDK.

**Manually passed variables:** `TENDIOCENTRAL_CLIENT_SECRET` and `TENDIOCENTRAL_REDIRECT_URI` must be read from `process.env` by your code and passed explicitly in the config as `clientSecret` and `redirectUri`.

**TendioCentral URL auto-resolution:** The SDK automatically resolves the TendioCentral server URL based on `NODE_ENV`, so most developers do not need to set `TENDIOCENTRAL_URL` at all. The resolution priority is:

1. Explicit `tendiocentralUrl` passed in the config object — always wins
2. `TENDIOCENTRAL_URL` environment variable — for custom instances or overrides
3. Auto-resolved from `NODE_ENV`: `production` → `https://central.mytendio2.com`, `development` and `staging` → the Tendio dev server
4. If none of the above resolve, the SDK throws a clear error

---

## 3. TendioCentral Portal Configuration

In the TendioCentral portal, create your application to obtain `CLIENT_ID` and `CLIENT_SECRET`.

**With auto-registration enabled (recommended):** The SDK automatically registers your app's URLs (redirect URI, homepage URL, SSO login URL, webhook URL) with TendioCentral on first startup. No manual URL entry in the dashboard is required. See [Section 5a: Auto-Registration](#5a-auto-registration) for details.

**Without auto-registration:** Manually configure the following in the portal:

| Field | Value |
|---|---|
| Homepage URL | `https://your-app.com` |
| SSO Login URL | The full URL that initiates the OAuth flow (e.g., `https://your-app.com/api/auth/sso/login`) |
| Redirect URIs | The OAuth callback URL (e.g., `https://your-app.com/auth/callback`) |
| Webhook URL | The URL that receives webhook events (e.g., `https://your-app.com/api/webhooks/tendiocentral`) |

**Note:** The SDK does not register any routes itself. It provides middleware functions (`initiateLogin()`, `handleCallback()`, `logout()`, `verifyWebhook()`) that you mount on whatever routes you choose. The URLs you configure must match where you mount the middleware.

---

## 4. Session Setup

The SDK requires `express-session` middleware. Configure it before mounting any SDK routes:

```typescript
import session from "express-session";
import connectPgSimple from "connect-pg-simple"; // or your session store

const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

Your sessions table needs columns: `sid` (VARCHAR primary key), `sess` (JSONB), `expire` (TIMESTAMP).

---

## 5. SDK Initialization

Create an `auth.ts` file:

```typescript
import { TendioAuth, parseEnvironment } from '@justinmcadoo/tendiocentral-sdk/express';
import type { TendioUser, TendioWebhookEvent } from '@justinmcadoo/tendiocentral-sdk';
import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';

let authInstance: Awaited<ReturnType<typeof TendioAuth.fromConfig>>;

export async function initializeAuth() {
  authInstance = await TendioAuth.fromConfig({
    // clientId is auto-read from TENDIOCENTRAL_CLIENT_ID env var
    // tendiocentralUrl is auto-resolved from NODE_ENV (no config needed)
    clientSecret: process.env.TENDIOCENTRAL_CLIENT_SECRET!,
    redirectUri: process.env.TENDIOCENTRAL_REDIRECT_URI!,
    webhookSecret: process.env.TENDIOCENTRAL_WEBHOOK_SECRET,
    environment: parseEnvironment(process.env.ENVIRONMENT),

    // Auto-registration (see Section 5a)
    autoRegisterUris: true,
    ssoLoginUrl: 'https://your-app.com/api/auth/sso/login',
    webhookUrl: 'https://your-app.com/api/webhooks/tendiocentral',

    // See Section 6 for hook implementations
    onUserNotFound: async (user: TendioUser) => { /* ... */ },
    onUserAuthenticated: async (user: TendioUser) => { /* ... */ },
    onBeforeLogout: async (req: unknown) => { /* ... */ },
  });

  return authInstance;
}

export function getAuth() {
  if (!authInstance) {
    throw new Error('Auth not initialized. Call initializeAuth() first.');
  }
  return authInstance;
}
```

Call `initializeAuth()` during app startup, **before** registering routes:

```typescript
// server/index.ts
import { initializeAuth } from './auth';

async function main() {
  await initializeAuth();
  console.log('[Auth] TendioCentral SDK initialized');

  // ... register routes, start server
}

main();
```

---

## 5a. Auto-Registration

The SDK can automatically register your app's URLs with TendioCentral during initialization, eliminating the need for manual URL entry in the admin dashboard.

### How it works

When `autoRegisterUris: true` is set in the config, the SDK checks the app config returned by TendioCentral during `init()`. If any URLs are missing, it sends a single `POST /api/apps/register-uris` request to register them:

| URL | Source | When registered |
|---|---|---|
| Redirect URI | `redirectUri` config option | When not in the registered URIs list |
| Webhook URL | `webhookUrl` config option | When `webhookConfigured` is `false` |
| Homepage URL | Auto-derived from `redirectUri` origin | When `homepageUrl` is not set |
| SSO Login URL | `ssoLoginUrl` config option | When `ssoLoginUrl` is not set or differs |

**Homepage URL derivation:** The SDK extracts the origin from your `redirectUri` automatically:
- `https://myapp.com/auth/callback` → `https://myapp.com`
- `http://localhost:3000/auth/callback` → `http://localhost:3000`

### Per-environment registration

All URLs are registered per-environment. When your app starts in development, it registers development URLs. When it starts in production, it registers production URLs. Each environment maintains its own set of URLs independently.

### Server-controlled toggle

TendioCentral provides an `autoRegisterUris` setting per application (defaults to `true`). The server value takes priority:

- Server `false` → registration is skipped, even if the local config has `autoRegisterUris: true`
- Server `true` + local config `true` → registration proceeds
- Server `true` + local config `false` (or not set) → registration is skipped

An admin can disable auto-registration at any time from the TendioCentral dashboard.

### Error handling

- If auto-registration fails, the SDK logs a warning and continues. The `validateRedirectUri` check still runs — if the redirect URI is missing, initialization will fail with a clear error.
- If the server returns `403 auto_registration_disabled`, the SDK logs a warning and continues normally.
- Registration is idempotent — calling it with already-registered URLs is a no-op.

### Example config

```typescript
await TendioAuth.fromConfig({
  clientSecret: process.env.TENDIOCENTRAL_CLIENT_SECRET!,
  redirectUri: 'https://myapp.com/auth/callback',
  ssoLoginUrl: 'https://myapp.com/api/auth/sso/login',
  webhookUrl: 'https://myapp.com/api/webhooks/tendiocentral',
  webhookSecret: process.env.TENDIOCENTRAL_WEBHOOK_SECRET,
  autoRegisterUris: true,
  environment: 'production',
});
```

### Setup flow with auto-registration

| Step | Who | What |
|---|---|---|
| 1 | Admin | Creates app in TendioCentral dashboard → gets `CLIENT_ID` + `CLIENT_SECRET` |
| 2 | Developer | Sets env vars (`CLIENT_ID`, `CLIENT_SECRET`, `TENDIOCENTRAL_URL`) |
| 3 | Developer | Configures SDK with `redirectUri`, `ssoLoginUrl`, `webhookUrl`, `autoRegisterUris: true` |
| 4 | SDK (auto) | On first startup: registers all URLs with TendioCentral |
| 5 | Done | App is fully configured — admin can verify or modify in dashboard |

---

## 5b. Role & Mapping Auto-Registration

In addition to URLs (5a), the SDK can auto-provision your app's **roles** and the
**access-granting role mappings** on startup, removing the manual "Application Roles + Role
Mappings" portal step. This is opt-in via `autoRegisterRoles: true` (defaults to `false`).

### How it works

When `autoRegisterRoles: true` and at least one of `roles` / `roleMappings` is provided, the SDK
sends a single `POST /api/apps/register-roles` request during `init()` — placed **after** URI
registration and **before** `validateRedirectUri()`. It uses the same HTTP Basic auth
(`base64(clientId:clientSecret)`) and is gated by the **same** "Allow Auto-Registration" toggle as
URI registration.

The call is an **idempotent upsert**: roles are upserted by case-insensitive `name`, and mappings
are created or updated for each `(tendioRole, app)` pair. Calling it on every boot is safe and
self-healing. Unknown Tendio role names are **never created** — they are skipped and reported in
`mappingsSkipped[]`.

### Config fields

| Field | Type | Notes |
|---|---|---|
| `autoRegisterRoles` | `boolean` (default `false`) | Master switch for the role/mapping call. |
| `roles` | `AppRoleDefinition[]` | The app's role catalog: `{ name, description?, isDefault? }`. |
| `roleMappings` | `AppRoleMapping[]` | `{ tendioRole, appRole, grantsAccess? }`; `grantsAccess` defaults `false`. |

> **Input vs. server shape:** `AppRoleDefinition` (what you pass in `roles`) is the consumer
> *input* type and is intentionally distinct from `AppRole`, the *server-returned* shape that also
> carries a server-assigned `id`. Don't confuse the two.

### Config-time validation (fail fast)

The constructor throws `invalid_config` *before any network call* when:
- `autoRegisterRoles` is `true` but neither `roles` nor `roleMappings` is provided.
- More than one role is marked `isDefault: true`.
- A `roleMappings[].appRole` doesn't match any `roles[].name` (only enforced when `roles` is
  supplied — if you pass mappings only, relying on pre-existing app roles, this check is skipped
  and the server reports any unknown app role).

### Error handling — non-fatal

Unlike the redirect-URI step (which gates startup via `validateRedirectUri()`), role registration
is **non-fatal**:
- A failed or disabled (`403 auto_registration_disabled`) role registration is **logged and
  swallowed** — it never crashes boot.
- The consequence of failure is that users may be denied access until mappings exist, so the
  warning is surfaced loudly in the logs.

### Example config

```typescript
type AppRole = 'operator' | 'viewer';

await TendioAuth.fromConfig<AppRole>({
  clientSecret: process.env.TENDIOCENTRAL_CLIENT_SECRET!,
  redirectUri: 'https://myapp.com/auth/callback',
  autoRegisterUris: true,
  autoRegisterRoles: true,
  roles: [
    { name: 'operator', description: 'Standard operations user', isDefault: true },
    { name: 'viewer', description: 'Read-only access' },
  ],
  roleMappings: [
    { tendioRole: 'ADMIN', appRole: 'operator', grantsAccess: true },
    { tendioRole: 'STAFF', appRole: 'operator', grantsAccess: true },
    { tendioRole: 'OWNER', appRole: 'viewer', grantsAccess: true },
  ],
  environment: 'production',
});
```

> `appRole` is typed against the SDK's `TRoles` generic, so `TendioAuth.fromConfig<AppRole>(...)`
> gives you compile-time checking that every mapping's `appRole` is one of your declared roles.

---

## 6. Lifecycle Hooks

### `onUserNotFound`

Called during OAuth callback when no local user exists for the SSO identity. Use this to match by email and link accounts:

```typescript
onUserNotFound: async (user: TendioUser) => {
  // Try to find an existing local user by email
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1);

  if (existing.length > 0) {
    // Return the local user ID to link this SSO identity to them
    return { localUserId: existing[0].id, linkSsoId: true };
  }

  // Return null to fall through to onUserAuthenticated
  return null;
},
```

### `onUserAuthenticated`

Called after every successful login. Use this to upsert the local user record:

```typescript
onUserAuthenticated: async (user: TendioUser) => {
  const updateFields = {
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    lastLoginAt: new Date(),
    authMethod: 'sso',
    ssoId: user.sub,
    role: user.role || 'employee',
  };

  if (user.resolvedLocalUserId) {
    // User was matched by onUserNotFound — update the linked record
    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, user.resolvedLocalUserId));
  } else {
    // Check if user already exists by ssoId
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.ssoId, user.sub))
      .limit(1);

    if (existing.length > 0) {
      await db.update(users).set(updateFields).where(eq(users.ssoId, user.sub));
    } else {
      // Create new user
      await db.insert(users).values({
        ...updateFields,
        isActive: '1',
      });
    }
  }
},
```

### `onBeforeLogout`

Called during logout after tokens are revoked but before the HTTP response. Destroy the local session here:

```typescript
onBeforeLogout: async (req: unknown) => {
  const expressReq = req as Request;
  await new Promise<void>((resolve) => {
    expressReq.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      resolve();
    });
  });
},
```

---

## 7. SSO Routes

### Login Route

The login route generates PKCE parameters, saves them to the session, and redirects to TendioCentral. **You must explicitly call `session.save()` before redirecting** to ensure the session is persisted:

```typescript
export const tendioSsoRouter = Router();

tendioSsoRouter.get('/login', (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth();
  const core = auth.getCore();

  const { verifier, challenge, state } = core.generatePKCE();
  const oauthKey = `${core.sessionKey}__oauth`;

  (req.session as any)[oauthKey] = {
    codeVerifier: verifier,
    state,
    returnTo: (req.query.returnTo as string) || '/',
  };

  const url = core.getAuthorizeUrl(state, challenge, {
    loginHint: req.query.login_hint as string | undefined,
    theme: req.query.theme as string | undefined,
  });

  // CRITICAL: Save session before redirect
  req.session.save((err) => {
    if (err) {
      console.error('Failed to save session before redirect:', err);
      return res.status(500).json({ error: 'Session initialization failed' });
    }
    res.redirect(url);
  });
});
```

### Callback Route

Handles the OAuth callback, looks up the local user, regenerates the session, and sets the user ID:

```typescript
tendioSsoRouter.get('/callback', (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth();
  auth.handleCallback()(req, res, async (err?: any) => {
    if (err) {
      console.error('Callback error:', err.message || err);
      return res.redirect('/?sso_error=auth_failed');
    }

    try {
      const tendioUser = req.tendioUser;
      if (!tendioUser) {
        return res.redirect('/?sso_error=no_user');
      }

      // Find the local user by ssoId
      const localUser = await db
        .select()
        .from(users)
        .where(eq(users.ssoId, tendioUser.sub))
        .limit(1);

      if (localUser.length === 0) {
        return res.redirect('/?sso_error=user_not_found');
      }

      const userId = localUser[0].id;

      // Regenerate session to prevent fixation attacks
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          return res.redirect('/?sso_error=session_error');
        }

        (req.session as any).userId = userId;

        req.session.save((saveErr) => {
          if (saveErr) {
            return res.redirect('/?sso_error=session_error');
          }
          res.redirect('/');
        });
      });
    } catch (error) {
      console.error('Post-callback error:', error);
      res.redirect('/?sso_error=internal_error');
    }
  });
});
```

### Logout Route

Clears the session cookie and delegates to the SDK's logout (which revokes tokens and calls `onBeforeLogout`):

```typescript
tendioSsoRouter.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth();
  res.clearCookie('connect.sid');
  auth.logout()(req, res, next);
});
```

The SDK's `logout()` returns `{ success: true, redirectTo: <portal_url> }` as JSON.

### Portal URL (Optional)

Expose the TendioCentral portal URL for "Back to TendioCentral" links:

```typescript
tendioSsoRouter.get('/portal-url', (_req: Request, res: Response) => {
  const auth = getAuth();
  const config = auth.getAppConfig();
  res.json({ portalUrl: config.ssoBaseUrl || process.env.TENDIOCENTRAL_URL || null });
});
```

---

## 8. Redirect URI Forwarding

If your registered redirect URI in TendioCentral (e.g., `/auth/callback`) differs from where your callback handler is mounted (e.g., `/api/auth/sso/callback`), add a redirect:

```typescript
app.get('/auth/callback', (req, res) => {
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(`/api/auth/sso/callback${qs ? `?${qs}` : ''}`);
});
```

---

## 9. Token Refresh Middleware

The SDK provides `refreshTokens()` middleware that silently refreshes access tokens when they're within 5 minutes of expiry. Mount it on all protected routes:

```typescript
import { getAuth } from './auth';

const refreshTokens = (req: Request, res: Response, next: NextFunction) =>
  getAuth().refreshTokens()(req, res, next);

// Apply to all protected route groups
app.use('/api/protected', refreshTokens, protectedRouter);
```

How it works:
- If no tokens exist in the session, it's a no-op (calls `next()`)
- If the access token has more than 5 minutes left, it attaches tokens to `req.tendioTokens` and continues
- If the access token is expiring soon, it refreshes using the refresh token, stores new tokens in the session, and continues
- Concurrent refresh requests for the same token are deduplicated

---

## 10. Webhook Handler

Handle real-time events from TendioCentral (user updates, deactivations, role changes, session revocations, bulk sync):

```typescript
import express from 'express';

export const tendioWebhookRouter = Router();

tendioWebhookRouter.post(
  '/',
  express.raw({ type: 'application/json' }),  // MUST use raw body for signature verification
  (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth();
    auth.verifyWebhook()(req, res, next);
  },
  async (req: Request, res: Response) => {
    const event = req.webhookEvent as TendioWebhookEvent;
    if (!event) {
      return res.status(400).json({ error: 'No webhook event parsed' });
    }

    const data = event.data as Record<string, unknown>;

    switch (event.event) {
      case 'user.deactivated':
        // Set user inactive in your DB
        break;

      case 'user.reactivated':
        // Set user active in your DB
        break;

      case 'user.updated':
        // Update user email/name in your DB
        break;

      case 'user.role_changed':
        // Update user role; if newRole is empty, deactivate
        break;

      case 'session.revoked_all':
        // Delete all sessions for this user from your session store
        // Use: DELETE FROM sessions WHERE sess->>'userId' = '<localUserId>'
        break;

      case 'users.bulk_synced':
        // Respond immediately, then process in background
        res.status(200).json({ received: true });
        // Use setImmediate() to process the user list asynchronously
        return;

      default:
        console.log(`Unhandled event: ${event.event}`);
    }

    res.status(200).json({ received: true });
  }
);
```

Mount the webhook router:

```typescript
app.use('/api/webhooks/tendiocentral', tendioWebhookRouter);
```

If using auto-registration, the webhook URL is registered automatically. Otherwise, register `https://your-app.com/api/webhooks/tendiocentral` manually in the TendioCentral portal.

---

## 11. Route Registration Summary

```typescript
// Session middleware (must be first)
app.use(session({ /* ... */ }));

// SSO routes (login, callback, logout) — no auth required
app.use('/api/auth/sso', tendioSsoRouter);

// Webhook route — uses raw body parser, no session auth
app.use('/api/webhooks/tendiocentral', tendioWebhookRouter);

// OAuth callback redirect (if redirect URI differs from callback route)
app.get('/auth/callback', (req, res) => {
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(`/api/auth/sso/callback${qs ? `?${qs}` : ''}`);
});

// Token refresh middleware for protected routes
const refreshTokens = (req, res, next) => getAuth().refreshTokens()(req, res, next);

// Protected routes — add refreshTokens before each
app.use('/api/users', refreshTokens, usersRouter);
app.use('/api/data', refreshTokens, dataRouter);
```

---

## 12. Frontend Integration

### Login Page

Redirect users to your SSO login route:

```typescript
const handleLogin = () => {
  window.location.href = '/api/auth/sso/login';
};
```

### Logout

Call your logout endpoint and redirect to the portal:

```typescript
const handleLogout = async () => {
  const res = await fetch('/api/auth/sso/logout', { method: 'POST', credentials: 'include' });
  const data = await res.json();
  if (data.redirectTo) {
    window.location.href = data.redirectTo;
  }
};
```

### Check Authentication

Create an endpoint that reads `session.userId` and returns the local user:

```typescript
// Backend
app.get('/api/auth/user', async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ message: 'Not authenticated' });

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user.length) return res.status(401).json({ message: 'User not found' });

  res.json(user[0]);
});
```

---

## 13. Database Requirements

Your users table needs at minimum:

| Column | Type | Description |
|---|---|---|
| `id` | serial/uuid | Your local user ID |
| `email` | varchar | User's email |
| `first_name` | varchar | First name from TendioCentral |
| `last_name` | varchar | Last name from TendioCentral |
| `sso_id` | varchar | TendioCentral `sub` claim (unique identifier) |
| `role` | varchar | User's role from TendioCentral |
| `is_active` | varchar/boolean | Whether the user is active |
| `auth_method` | varchar | Set to `'sso'` |
| `last_login_at` | timestamp | Last login timestamp |

Your sessions table needs:

| Column | Type | Description |
|---|---|---|
| `sid` | varchar | Session ID (primary key) |
| `sess` | jsonb | Session data |
| `expire` | timestamp | Session expiration |

---

## 14. Configuration Reference

### `TendioAuth.fromConfig(config)` Options

| Option | Type | Required | Description |
|---|---|---|---|
| `clientId` | string | No | App client ID (auto-read from `TENDIOCENTRAL_CLIENT_ID` env var) |
| `clientSecret` | string | Yes | App client secret |
| `redirectUri` | string | Yes | Full absolute OAuth callback URL |
| `tendiocentralUrl` | string | No | TendioCentral server URL. Auto-resolved from `NODE_ENV` (`production`, `development`, `staging`). Only needed to override the default or point at a custom instance. Falls back to `TENDIOCENTRAL_URL` env var. |
| `environment` | string | No | `'development'`, `'staging'`, or `'production'` (defaults to `'production'`) |
| `webhookSecret` | string | No | Secret for verifying webhook payloads (auto-read from `TENDIOCENTRAL_WEBHOOK_SECRET` env var) |
| `webhookUrl` | string | No | Webhook endpoint URL (used for auto-registration) |
| `ssoLoginUrl` | string | No | SSO login initiation URL (used for auto-registration) |
| `autoRegisterUris` | boolean | No | Enable auto-registration of URLs during init (default `false`) |
| `allowCredentialsLogin` | boolean | No | Enable ROPC login via `loginWithCredentials()` (default `false`) |
| `scopes` | string[] | No | OAuth scopes (default: `['openid', 'profile', 'email', 'roles']`) |
| `sessionKey` | string | No | Session storage key prefix (default: `'tendioUser'`) |
| `onUserNotFound` | function | No | Called when no local user exists for the SSO identity |
| `onUserAuthenticated` | function | No | Called after every successful login |
| `onBeforeLogout` | function | No | Called during logout after token revocation |
| `logger` | object | No | Custom logger with `info`, `warn`, `error` methods |

---

## 15. Available SDK Methods

| Method | Description |
|---|---|
| `TendioAuth.fromConfig(config)` | Initialize the SDK (async) |
| `getAuth().initiateLogin()` | Middleware that redirects to TendioCentral login |
| `getAuth().handleCallback()` | Middleware that processes the OAuth callback |
| `getAuth().handleCredentialsLogin()` | Middleware for ROPC login (requires `allowCredentialsLogin: true`) |
| `getAuth().logout(options?)` | Middleware that revokes tokens and logs out |
| `getAuth().requireAuth(options?)` | Middleware that blocks unauthenticated requests |
| `getAuth().requireRole(...roles)` | Middleware that requires specific roles |
| `getAuth().requireStaff()` | Middleware that requires staff user type |
| `getAuth().requireCaregiver()` | Middleware that requires caregiver user type |
| `getAuth().requireLocation(locationId)` | Middleware that requires a specific location |
| `getAuth().refreshTokens()` | Middleware that silently refreshes expiring tokens |
| `getAuth().verifyWebhook()` | Middleware that verifies webhook signatures |
| `getAuth().getAppConfig()` | Returns the app configuration from TendioCentral |
| `getAuth().fetchUser(userId)` | Fetch a single user from TendioCentral |
| `getAuth().fetchAllUsers()` | Fetch all users from TendioCentral |
| `getAuth().triggerSync()` | Trigger a user sync from TendioCentral |
| `getAuth().getCore()` | Access the core TendioAuth instance (for PKCE, etc.) |

---

## 16. TendioUser Object

After authentication, `req.tendioUser` contains:

```typescript
{
  sub: string;              // Unique SSO identifier
  email: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  user_type: 'staff' | 'caregiver';
  role: string;             // Role name from your app's role config
  role_id: string;
  tenant: string;           // Company/tenant name
  tenant_id: string;
  location: string;
  location_id: number;
  primary_location_id: number;
  primary_location_name: string;
  locations: Array<{ id: number; name: string; is_primary: boolean }>;
  timezone: string;
  portal_url: string;       // URL to the TendioCentral portal
  resolvedLocalUserId?: string;  // Set by onUserNotFound when linking
}
```

---

## 17. Checklist

### With Auto-Registration (recommended)

- [ ] Install the SDK: `npm install @justinmcadoo/tendiocentral-sdk`
- [ ] Create app in TendioCentral dashboard (get `CLIENT_ID` and `CLIENT_SECRET`)
- [ ] Set environment variables: `TENDIOCENTRAL_CLIENT_ID`, `TENDIOCENTRAL_CLIENT_SECRET`, `TENDIOCENTRAL_URL`, `SESSION_SECRET`
- [ ] Optionally set: `TENDIOCENTRAL_WEBHOOK_SECRET`, `ENVIRONMENT`
- [ ] Configure express-session with a persistent store (PostgreSQL recommended)
- [ ] Create auth.ts with `initializeAuth()`, `getAuth()`, lifecycle hooks
- [ ] Set `autoRegisterUris: true`, `redirectUri`, `ssoLoginUrl`, and optionally `webhookUrl` in config
- [ ] Call `initializeAuth()` at app startup before route registration
- [ ] Create SSO router with `/login`, `/callback`, `/logout` routes
- [ ] Mount SSO router (e.g., `app.use('/api/auth/sso', tendioSsoRouter)`)
- [ ] Add redirect URI forwarding if needed (`/auth/callback` -> `/api/auth/sso/callback`)
- [ ] Mount `refreshTokens()` middleware on all protected routes
- [ ] Set up webhook router and mount it (optional but recommended)
- [ ] Add users table with `sso_id` column
- [ ] Add sessions table with `sid`, `sess`, `expire` columns
- [ ] Build login page that redirects to `/api/auth/sso/login`
- [ ] Build auth check endpoint that reads `session.userId`
- [ ] Test: login flow, callback, session persistence, logout, token refresh

### Without Auto-Registration

- [ ] All steps above, but skip `autoRegisterUris`, `ssoLoginUrl`, `webhookUrl` in config
- [ ] Manually register in TendioCentral portal: Homepage URL, SSO Login URL, Redirect URIs, Webhook URL
