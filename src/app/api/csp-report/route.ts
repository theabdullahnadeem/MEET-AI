import { NextRequest, NextResponse } from "next/server";

import { rateLimitOk, clientIp } from "@/lib/ratelimit";

// S-8: CSP violation collector. Browsers POST reports here (see the
// report-uri directive in next.config.ts); logging them makes violations
// visible in Vercel logs ("[csp-report]") so the report-only policy can be
// tuned and eventually flipped to enforcing. Anonymous by design — no auth
// (browsers send these without credentials), so keep it rate-limited and
// size-capped.
const MAX_REPORT_BYTES = 50_000;

export async function POST(req: NextRequest) {
  if (!(await rateLimitOk("webhook", clientIp(req)))) {
    return new NextResponse(null, { status: 429 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const body = await req.text();
  if (body.length > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // Truncate defensively — one line per violation is plenty to tune the policy.
  console.warn("[csp-report]", body.slice(0, 2_000));

  return new NextResponse(null, { status: 204 });
}
