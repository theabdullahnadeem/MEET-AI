import type { NextConfig } from "next";

// SEC-3 / F-05: defence-in-depth HTTP response headers.
// NOTE: Content-Security-Policy is intentionally NOT set here yet — it is the one
// header that can break the app (LiveKit media, Stream Chat, dicebear avatars,
// inline styles). Roll it out separately as `Content-Security-Policy-Report-Only`
// first, allow-list the needed origins, then switch to enforcing.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
