// S-10: pre-launch smoke load test. Exercises the public, unauthenticated
// surface — enough to catch a broken deploy, a missing header, or a route
// that 500s under mild concurrency. Media load is LiveKit Cloud's problem.
//
//   k6 run tools/k6-smoke.js -e BASE_URL=https://meet-ai-self.vercel.app
//
// Pass criteria: all checks green, p95 < 1s, zero 5xx.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 25 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  // Landing redirects unauthenticated visitors to /sign-in.
  const signIn = http.get(`${BASE}/sign-in`);
  check(signIn, {
    "sign-in 200": (r) => r.status === 200,
    "HSTS header present": (r) =>
      String(r.headers["Strict-Transport-Security"] ?? "").includes("max-age"),
    "CSP report-only present": (r) =>
      "Content-Security-Policy-Report-Only" in r.headers ||
      "Content-Security-Policy" in r.headers,
  });

  // Token route must reject unauthenticated callers with 401 — never 5xx.
  const token = http.get(`${BASE}/api/livekit-token?room=smoke-test`);
  check(token, {
    "token route rejects cleanly": (r) => r.status === 401 || r.status === 403,
  });

  // Webhook route must reject unsigned posts with 4xx — never 5xx.
  const webhook = http.post(`${BASE}/api/livekit-webhook`, "{}", {
    headers: { "Content-Type": "application/json" },
  });
  check(webhook, {
    "webhook rejects unsigned": (r) => r.status >= 400 && r.status < 500,
  });

  sleep(1);
}
