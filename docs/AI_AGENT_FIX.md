# AI Agent Not Joining Meeting — Root Cause & Fix

## Problem
The AI agent joins the meeting for a split second and then immediately disconnects. The meeting screen goes blank and becomes unresponsive.

## Root Cause

**OpenAI deprecated the Realtime Beta API on May 12, 2026.**

The `@stream-io/openai-realtime-api@0.3.3` package depends on the deprecated `@openai/realtime-api-beta` package, which:

1. Sends the header `OpenAI-Beta: realtime=v1` — OpenAI now rejects this header with `server_error code 42`
2. Uses the deprecated model `gpt-4o-realtime-preview` — removed from the API on May 7, 2026

The new OpenAI Realtime API is now Generally Available (GA) and requires:
- Model: `gpt-realtime-2` (replaces `gpt-4o-realtime-preview`)
- No `OpenAI-Beta` header (the API is no longer in beta)

## Error Log
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

## Fixes Applied

### 1. Model Update (`src/app/api/webhook/route.ts`)
```diff
- model: "gpt-4o-realtime-preview",
+ model: "gpt-realtime-2",
```

### 2. Remove Deprecated Header (via `patch-package`)
Patched `@stream-io/openai-realtime-api@0.3.3` to remove the `OpenAI-Beta: realtime=v1` header from WebSocket requests.

Patch file: `patches/@stream-io+openai-realtime-api+0.3.3.patch`

The patch is auto-applied via the `postinstall` script in `package.json`.

### 3. Participant Left Handler Fix (`src/app/api/webhook/route.ts`)
The original `call.session_participant_left` handler called `call.end()` for ANY participant leaving, including the AI agent. If the AI had a momentary disconnect, it would kill the entire call.

Fixed to only end the call when the **human user** leaves:
```diff
- const call = streamVideo.video.call("default", meetingId);
- await call.end();
+ const leftUserId = event.participant?.user?.id;
+ const [meeting] = await db
+   .select()
+   .from(meetings)
+   .where(eq(meetings.id, meetingId));
+
+ if (meeting && leftUserId !== meeting.agentId) {
+   const call = streamVideo.video.call("default", meetingId);
+   await call.end();
+ }
```

### 4. Status Icon Fallback (`src/modules/meetings/ui/component/columns.tsx`)
Meetings with unknown status values (e.g. `"failed"`) crashed the meetings table. Added a fallback icon:
```diff
- const Icon = statusIconMap[row.original.status as keyof typeof statusIconMap];
+ const Icon = statusIconMap[row.original.status as keyof typeof statusIconMap] ?? CircleXIcon;
```

## Files Changed
- `src/app/api/webhook/route.ts` — model update + participant left fix
- `src/modules/meetings/ui/component/columns.tsx` — status icon fallback
- `package.json` — added `postinstall: "patch-package"`
- `patches/@stream-io+openai-realtime-api+0.3.3.patch` — removes deprecated header

## Long-Term Fix
When Stream releases an updated `@stream-io/openai-realtime-api` package that supports the GA Realtime API, the patch can be removed.
