# Deploying the LiveKit Agent Worker

The AI meeting agent is a long-lived Node process (it holds persistent
WebSocket connections to LiveKit and OpenAI), so it cannot run on Vercel
serverless. The migration plan originally targeted Koyeb, but Koyeb removed its
free tier for new accounts (Mistral acquisition, Feb 2026). We deploy to
**LiveKit Cloud's native agent hosting** instead — same vendor, the free Build
tier includes 1,000 agent minutes/month and up to 5 concurrent sessions.

The agent code is `src/agents/meeting-agent.ts`. It reads agent config
(`agentInstructions`, etc.) from the LiveKit room metadata that
`meeting.create` sets, connects to the room, and bridges audio to the OpenAI
GA Realtime API (`gpt-realtime`).

## Run locally (no deploy needed)

Two terminals:

```bash
# Terminal 1 — Next.js app
npm run dev

# Terminal 2 — agent worker (connects to your live LiveKit Cloud project)
npm run dev:agent
```

Required env vars (same `.env` the app uses): `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `OPENAI_API_KEY`.

Create a meeting, join it, and the agent should join within a few seconds and
respond to your voice.

## Deploy to LiveKit Cloud

Prerequisites: the LiveKit CLI (`lk`) installed and authenticated against your
project (`lk cloud auth`).

```bash
# First time — creates the agent, generates livekit.toml, and deploys.
# Run from the repo root (it uses the Dockerfile here).
lk agent create

# Subsequent deploys
lk agent deploy
```

Set these as secrets in the LiveKit Cloud agent config (NOT committed). As of
PR 6 the agent also writes the transcript to R2 and records its URL in the DB,
so it needs the R2 credentials and `DATABASE_URL` too:

```
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=meet-ai-storage
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are injected
automatically by LiveKit Cloud for hosted agents — you do not set them.

`lk agent create` generates a `livekit.toml` (contains your project-specific
agent id/subdomain) — commit it when it appears so future deploys are
reproducible.

## Notes

- The worker uses **automatic dispatch** (no `agentName` set), so it joins
  every room created in the project. Our rooms are created server-side in
  `meeting.create`.
- Model is `gpt-realtime` (the plugin's default GA model). If your OpenAI
  account is provisioned for a newer realtime snapshot, change the `model`
  field in `src/agents/meeting-agent.ts`.
- The `Dockerfile` and `.dockerignore` at the repo root are for this agent
  only — Vercel ignores them and builds the Next.js app separately.
