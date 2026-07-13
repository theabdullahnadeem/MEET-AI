import type { NextConfig } from "next";

// S-8: Content-Security-Policy, rolled out in REPORT-ONLY mode — violations
// are reported (to /api/csp-report → visible in Vercel logs as "[csp-report]")
// but nothing is blocked, so this cannot break the app. After ~a week of
// clean logs, flip the header name to "Content-Security-Policy" to enforce.
//
// Allow-list rationale:
// - script/style 'unsafe-inline': required by Next.js inline runtime chunks
//   and inline style attributes (nonce-based CSP needs middleware + fully
//   dynamic rendering — revisit post-launch). 'unsafe-eval' dev-only (HMR).
// - connect-src: LiveKit Cloud signalling (wss + https, regional subdomains)
//   and Stream Chat's API/websocket.
// - img-src https:: OAuth avatars (GitHub/Google), Stream CDN; data:/blob:
//   for dicebear data-URI avatars and local previews.
// - media-src https: blob:: recording playback via presigned R2 URLs.
// - worker-src blob:: LiveKit audio processing workers.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.livekit.cloud wss://*.livekit.cloud https://*.stream-io-api.com wss://*.stream-io-api.com",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
].join("; ");

// SEC-3 / F-05: defence-in-depth HTTP response headers.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self)" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
