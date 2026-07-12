// Vitest setup: dummy env vars for modules that assert their presence at
// import time (lib/r2.ts, lib/livekit.ts, …). Runs before each test file.
process.env.R2_ENDPOINT ??= "https://test.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test-bucket";
process.env.LIVEKIT_API_KEY ??= "testkey";
process.env.LIVEKIT_API_SECRET ??= "testsecret";
process.env.LIVEKIT_URL ??= "wss://test.livekit.cloud";
