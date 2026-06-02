# OpenAI Realtime API Deprecation Fix

## Summary

The AI agent was disconnecting immediately after joining meetings, leaving the screen blank and unresponsive. Root cause was OpenAI's deprecation of the Beta Realtime API on May 12, 2026.

---

## Root Cause Analysis

### The Error

```
AI AGENT ERROR: {
  type: 'error',
  error: {
    type: 'server_error',
    code: '42',
    message: 'Error:  code ',
    param: null,
    event_id: ''
  }
}
```

### Why It Happened

OpenAI deprecated the Realtime Beta API on **May 12, 2026**. The `@stream-io/openai-realtime-api@0.3.3` package internally uses `@openai/realtime-api-beta`, which was built for the old Beta API. Two things broke simultaneously:

| Breaking Change | Old (Deprecated) | New (GA) |
|----------------|-----------------|---------|
| Model name | `gpt-4o-realtime-preview` | `gpt-realtime-2` |
| HTTP header | `OpenAI-Beta: realtime=v1` | *(removed — API is now GA)* |

When `connectOpenAi()` was called, OpenAI's servers rejected the WebSocket handshake with `server_error code 42` because:
1. The model `gpt-4o-realtime-preview` was removed from the API on May 7, 2026
2. The `OpenAI-Beta: realtime=v1` header is no longer accepted

The agent connected for a split second (the call started locally), then OpenAI's server immediately closed the WebSocket — causing the blank/unresponsive meeting screen.

### Secondary Bug (Compounding Issue)

The `call.session_participant_left` webhook handler was calling `call.end()` for **any** participant departure, including the AI agent itself. So even if the AI had only a momentary network blip, the entire meeting call would be terminated. This made debugging harder and caused unnecessary call endings.

---

## Fixes Applied

### Fix 1 — Update model name (`src/app/api/webhook/route.ts`)

```diff
- model: "gpt-4o-realtime-preview",
+ model: "gpt-realtime-2",
```

The GA Realtime API requires the new model identifier. Without this, the connection is rejected by OpenAI before any session can be established.

**File:** [`src/app/api/webhook/route.ts`](../src/app/api/webhook/route.ts) — line 128

---

### Fix 2 — Remove deprecated `OpenAI-Beta` header (via patch-package)

The `@stream-io/openai-realtime-api` package hard-codes `request.setHeader("OpenAI-Beta", "realtime=v1")` in its WebSocket request builder. OpenAI now rejects this header on all GA endpoints.

Since the package is not yet updated to support the GA API, a patch is applied at install time via `patch-package`.

**Patch file:** [`patches/@stream-io+openai-realtime-api+0.3.3.patch`](../patches/@stream-io+openai-realtime-api+0.3.3.patch)

```diff
- request.setHeader("OpenAI-Beta", "realtime=v1");
+ // OpenAI-Beta header removed - Realtime API is now GA
```

The patch covers both the CJS (`dist/index.cjs`) and ESM (`dist/index.mjs`) builds of the package.

**Auto-applied via `package.json`:**

```json
"scripts": {
  "postinstall": "patch-package"
}
```

---

### Fix 3 — Only end call when human leaves (`src/app/api/webhook/route.ts`)

**Before (broken):**
```typescript
// This ended the call for ANY participant leaving — including the AI agent
const call = streamVideo.video.call("default", meetingId);
await call.end();
```

**After (fixed):**
```typescript
const leftUserId = event.participant?.user?.id;
const [meeting] = await db
  .select()
  .from(meetings)
  .where(eq(meetings.id, meetingId));

if (meeting && leftUserId !== meeting.agentId) {
  const call = streamVideo.video.call("default", meetingId);
  await call.end();
}
```

The meeting's `agentId` is used to distinguish the AI agent from human participants. `call.end()` is only called when a human participant leaves.

**File:** [`src/app/api/webhook/route.ts`](../src/app/api/webhook/route.ts) — lines 169–179

---

### Fix 4 — Status icon fallback (`src/modules/meetings/ui/component/columns.tsx`)

Meetings with unexpected status values (e.g. `"failed"`) caused a runtime crash in the meetings table because `statusIconMap[status]` returned `undefined` and React tried to render it as a component.

```diff
- const Icon = statusIconMap[row.original.status as keyof typeof statusIconMap];
+ const Icon = statusIconMap[row.original.status as keyof typeof statusIconMap] ?? CircleXIcon;
```

**File:** [`src/modules/meetings/ui/component/columns.tsx`](../src/modules/meetings/ui/component/columns.tsx) — line 66

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/webhook/route.ts` | Model updated to `gpt-realtime-2`; participant left handler now checks user ID |
| `src/modules/meetings/ui/component/columns.tsx` | Null-coalescing fallback for unknown status icons |
| `package.json` | Added `postinstall: "patch-package"` |
| `patches/@stream-io+openai-realtime-api+0.3.3.patch` | Removes deprecated `OpenAI-Beta` header from both CJS and ESM builds |

---

## Long-Term Resolution

This fix uses `patch-package` as a temporary shim. Once `@stream-io/openai-realtime-api` releases a version that targets the GA Realtime API natively:

1. Upgrade the package: `npm install @stream-io/openai-realtime-api@<new-version>`
2. Delete `patches/@stream-io+openai-realtime-api+0.3.3.patch`
3. Remove or update the `postinstall` script if no other patches remain

Monitor: https://github.com/GetStream/openai-realtime-api/releases
