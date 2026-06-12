# Code Quality Standards
## Scalable · Secure · Production-Ready

> Every PR must pass all standards in this file before merge.
> These are non-negotiable. No exceptions for "we'll fix it later."

---

## 1. TypeScript — Strictness Rules

### `tsconfig.json` must have:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Rules
- **No `any`** — ever. Use `unknown` and narrow with type guards.
- **No `!` non-null assertions** on user-supplied data. Only on env vars at module init (fail fast).
- **No `as` casts** unless you've proven the type via a type guard first.
- **All function return types must be explicit** on exported functions.
- Every `async` function must either `return` a typed value or `Promise<void>`.
- Every `.catch()` must log the error. Never silently swallow.

```typescript
// ❌ Bad
const data = res.json() as { id: string };

// ✅ Good
const raw = await res.json();
if (!isMySchema(raw)) throw new Error("Unexpected response shape");
const data = raw; // narrowed
```

---

## 2. Input Validation — Zod Everywhere

**Rule:** Every external input is untrusted. Validate it with Zod before using it.

External inputs include:
- HTTP request bodies
- URL query parameters
- Webhook payloads
- Room metadata from LiveKit
- Transcript data fetched from external URLs
- Environment variables (at startup)

### Environment variables (validate at startup, not inline)
```typescript
// src/lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().startsWith("sk-"),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
// If this throws, the app crashes at startup with a clear error. Good.
```

### Room metadata (never trust JSON.parse directly)
```typescript
const roomMetadataSchema = z.object({
  meetingId: z.string().min(1),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  agentInstructions: z.string().optional(),
});

// Usage
const raw = JSON.parse(event.room?.metadata ?? "{}");
const metadata = roomMetadataSchema.safeParse(raw);
if (!metadata.success) {
  console.error("Invalid room metadata:", metadata.error);
  return NextResponse.json({ status: "skipped" });
}
// Now use metadata.data safely
```

### API route query params
```typescript
const querySchema = z.object({
  room: z.string().min(1).max(255),
});

const query = querySchema.safeParse({
  room: req.nextUrl.searchParams.get("room"),
});

if (!query.success) {
  return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
}
```

---

## 3. Authentication — Every Route is Protected

### tRPC procedures
- Never use `publicProcedure` for any data-modifying operation.
- `protectedProcedure` for anything touching user data.
- `premiumProcedure` for features behind a paywall.
- Always verify `ctx.auth.user.id` matches the resource owner before reading/writing.

```typescript
// ❌ Bad — exposes data to any authenticated user
getOne: protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    return db.select().from(meetings).where(eq(meetings.id, input.id));
  }),

// ✅ Good — scoped to the requesting user
getOne: protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input, ctx }) => {
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.id, input.id),
          eq(meetings.userId, ctx.auth.user.id), // ← ownership check
        ),
      );
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND" });
    return meeting;
  }),
```

### API routes
```typescript
// Every API route that handles user data:
const session = await auth.api.getSession({ headers: await headers() });
if (!session) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Webhook routes
Webhooks are NOT authenticated via session. They use **signature verification**.
**Never skip signature verification.** A webhook without verification lets anyone trigger
meeting state changes, agent sessions, or Inngest jobs.

```typescript
// LiveKit webhooks — always verify
const event = receiver.receive(body, authHeader);
// If this throws → return 401, do not process

// Stream webhooks — always verify
if (!verifySignatureWithSdk(body, signature)) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}
```

---

## 4. API Security

### Rate limiting
Every public-facing API route must have rate limiting. Use Vercel's built-in rate limiting
or implement with an in-memory store (good enough for single-instance, Redis for multi-instance).

At minimum, protect:
- `/api/livekit-token` — token generation (prevents room flooding)
- `/api/auth/*` — sign-in/sign-up (prevents brute force)
- `/api/trpc/*` — tRPC mutations

```typescript
// Simple in-memory rate limit (src/lib/rate-limit.ts)
const requests = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = requests.get(key);

  if (!entry || now > entry.resetAt) {
    requests.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= limit) return false; // blocked

  entry.count++;
  return true; // allowed
}

// Usage in route:
const allowed = rateLimit(`token:${session.user.id}`, 10, 60_000); // 10/min
if (!allowed) {
  return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
}
```

### Security headers
Add to `next.config.ts`:
```typescript
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval in dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' wss: https:",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];
```

### Never expose secrets to the client
- `LIVEKIT_API_SECRET` — server only, never `NEXT_PUBLIC_*`
- `OPENAI_API_KEY` — server only
- `STREAM_VIDEO_SECRET` — server only
- `DATABASE_URL` — server only
- `BETTER_AUTH_SECRET` — server only

Only these should be `NEXT_PUBLIC_`:
- `NEXT_PUBLIC_LIVEKIT_URL`
- `NEXT_PUBLIC_STREAM_API_KEY` (needed for Stream Chat client)
- `NEXT_PUBLIC_APP_URL`

---

## 5. Error Handling

### Never let errors leak internals to the client
```typescript
// ❌ Bad — exposes stack trace and internal details
catch (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

// ✅ Good — log internally, return generic message externally
catch (error) {
  console.error("[livekit-webhook] Unhandled error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

### tRPC error codes
Use the right code — don't return `INTERNAL_SERVER_ERROR` for user input errors:
| Situation | tRPC Code |
|-----------|-----------|
| Resource doesn't exist | `NOT_FOUND` |
| Not logged in | `UNAUTHORIZED` |
| Logged in but no permission | `FORBIDDEN` |
| Bad input (validation) | `BAD_REQUEST` |
| Unexpected server error | `INTERNAL_SERVER_ERROR` |

### Agent error handling
```typescript
// In meeting-agent.ts — never let the agent crash silently
try {
  await session.start(ctx.room, agent);
} catch (error) {
  console.error(`[Agent] Failed to start session for room ${ctx.room.name}:`, error);
  // Agent exits gracefully — LiveKit will not re-dispatch unless configured
}
```

---

## 6. Database Security

### Always scope queries to the authenticated user
Every `SELECT`, `UPDATE`, `DELETE` on user-owned data must include `eq(table.userId, ctx.auth.user.id)`.
This prevents horizontal privilege escalation (user A seeing/modifying user B's data).

### Never pass raw user input to SQL
Drizzle ORM parameterises everything — never concatenate strings into queries.

```typescript
// ❌ Never do this
const result = await db.execute(sql`SELECT * FROM meetings WHERE name = '${userInput}'`);

// ✅ Always use ORM
const result = await db.select().from(meetings).where(ilike(meetings.name, `%${userInput}%`));
```

### Transactions for multi-step writes
```typescript
// If two writes must succeed together, use a transaction
await db.transaction(async (tx) => {
  await tx.update(meetings).set({ status: "active" }).where(...);
  await tx.insert(activityLog).values({ ... });
});
```

---

## 7. Secrets Management

- **Never commit `.env`** — `.gitignore` must include `.env*` (except `.env.example`)
- **`.env.example` must list all required vars** with placeholder values — no real secrets
- **Rotate secrets immediately** if accidentally committed (even for 1 second)
- **Use different secrets per environment** — dev, staging, production keys are separate
- **Minimum secret length:** API secrets ≥ 32 chars, auth secrets ≥ 64 chars

---

## 8. Logging Standards

### What to log
```typescript
// ✅ Log: webhook event types received
console.log("[webhook] Event:", event.event, "room:", roomName);

// ✅ Log: agent lifecycle
console.log("[agent] Joining room:", roomName);
console.log("[agent] Session started");
console.log("[agent] Session ended");

// ✅ Log: errors with context
console.error("[meeting-create] Failed to create LiveKit room:", error);
```

### What NOT to log
```typescript
// ❌ Never log secrets
console.log("Using API key:", process.env.LIVEKIT_API_KEY);

// ❌ Never log full user data (PII)
console.log("User:", JSON.stringify(session.user));

// ❌ Never log full request bodies (may contain tokens)
console.log("Body:", body);
```

### Log format
Prefix every log with the module name in brackets: `[module-name]`.
This makes searching logs trivial.

---

## 9. Code Structure Rules

### File organisation (keep consistent)
```
src/
  agents/          ← LiveKit agent workers (Node.js processes)
  app/             ← Next.js pages and API routes
  components/      ← Shared UI components
  db/              ← Schema and migrations only
  hooks/           ← React hooks
  inngest/         ← Background job definitions
  lib/             ← Third-party client instances (one export per file)
  modules/         ← Feature modules (server + UI co-located)
  trpc/            ← tRPC setup and routers
```

### One concern per file
- `src/lib/livekit.ts` — only LiveKit client and token functions. No business logic.
- `src/lib/auth.ts` — only auth config. No routes.
- Webhook handlers contain only event routing, not business logic. Business logic lives in tRPC procedures or Inngest functions.

### No circular imports
- `lib/` files cannot import from `modules/`
- `db/` cannot import from anywhere else
- `agents/` can import from `lib/` and `db/` but not `modules/` or `app/`

---

## 10. Pre-Merge Checklist (run before every PR)

```bash
# 1. TypeScript — zero errors
npx tsc --noEmit

# 2. Lint — zero warnings
npm run lint

# 3. No stray console.log with secrets (grep)
grep -r "API_KEY\|SECRET\|PASSWORD\|TOKEN" src/ --include="*.ts" --include="*.tsx" | grep "console.log"
# Output should be empty

# 4. No direct process.env access outside src/lib/env.ts
grep -r "process\.env\." src/ --include="*.ts" --include="*.tsx" | grep -v "src/lib/env.ts" | grep -v "next.config"
# Review any results — should only be src/lib/*.ts initialisation files

# 5. No any types
grep -rn ": any" src/ --include="*.ts" --include="*.tsx"
# Output should be empty

# 6. Build passes
npm run build

# 7. Verify on live domain — not just localhost
```

---

## 11. Dependency Rules

- **Pin exact versions** for security-critical packages (`livekit-server-sdk`, `@livekit/agents`, `openai`). Use `^` only for UI libraries.
- **No unused packages** — remove from `package.json` if not imported anywhere.
- **Audit regularly:** `npm audit` — fix HIGH and CRITICAL before deploying.
- **Never install packages as both dependency and devDependency.**
- **No packages with known RCE vulnerabilities** — check https://security.snyk.io before installing anything new.

---

## 12. Performance Rules

- **No N+1 queries** — use `inArray` for batch fetches, never loop over `db.select()`.
- **Paginate everything** — no unbounded `SELECT *` on user-facing lists.
- **LiveKit tokens are cheap** — generate fresh, never cache (tokens expire, stale tokens cause auth failures).
- **Agent metadata is in the room** — don't hit the DB inside the agent entry function unless necessary; use room metadata passed at room creation time.
