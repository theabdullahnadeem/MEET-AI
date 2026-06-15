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

**1. Install + authenticate the LiveKit CLI** (Windows):

```powershell
winget install LiveKit.LiveKitCLI
lk cloud auth          # opens a browser to link your project
```

**2. Put your OpenAI key in a secrets file** at the repo root. Name it `.env.agent`
(already covered by the `.env*` gitignore rule, so it won't be committed):

```
OPENAI_API_KEY=sk-...
```

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are injected
automatically by LiveKit Cloud for hosted agents — do NOT put them here.

**3. Create + deploy** from the repo root (the trailing `.` is the build context,
so you must `cd` to the repo root first):

```powershell
cd D:\Meetzio\MEET-AI
# First time — registers the agent, writes livekit.toml, builds the image, deploys.
# Use an ABSOLUTE path for --secrets-file; a relative path can fail with "open .env.agent:".
lk agent create --secrets-file "D:\Meetzio\MEET-AI\.env.agent" .

# Subsequent deploys (after any agent code change)
lk agent deploy
```

> **Merging a PR does NOT redeploy the agent.** Unlike Vercel, LiveKit Cloud only
> updates the agent when you run `lk agent deploy`. Always redeploy after changing
> `src/agents/meeting-agent.ts`.

**4. Check it's live:**

```powershell
lk agent status                       # Status: Running, note the Version + Deployed At
lk agent logs --log-type deploy       # worker stdout, incl. [Agent] … lines when a job runs
```

`lk agent create` generates a `livekit.toml` (contains your project-specific
agent id/subdomain) — commit it so future deploys are reproducible.

## Notes

- The worker uses **automatic dispatch** (no `agentName` set), so it joins
  every room created in the project. Our rooms are created server-side in
  `meeting.create`.
- Model is `gpt-realtime` (the plugin's default GA model). If your OpenAI
  account is provisioned for a newer realtime snapshot, change the `model`
  field in `src/agents/meeting-agent.ts`.
- The `Dockerfile` and `.dockerignore` at the repo root are for this agent
  only — Vercel ignores them and builds the Next.js app separately.
