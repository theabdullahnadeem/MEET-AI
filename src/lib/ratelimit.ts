import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// SEC-4 / F-04: rate-limit the public API routes against abuse.
//
// OPTIONAL + FAIL-OPEN. If the Upstash env vars are not set (local dev, the
// build, or before the Redis database is provisioned in Vercel), rate limiting
// is DISABLED and every request passes. If Redis errors at runtime we also fail
// open — a transient Redis problem must never take the app down.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

if (!redis && process.env.NODE_ENV === "production") {
  console.warn(
    "[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting is DISABLED.",
  );
}

type Bucket = "token" | "webhook";

const limiters: Record<Bucket, Ratelimit | null> = redis
  ? {
      // A user minting LiveKit join tokens — far above any legitimate burst.
      token: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, "60 s"),
        prefix: "meetai/rl/token",
      }),
      // Signed webhooks from LiveKit / Stream — generous so legitimate events are
      // never dropped; this only stops an extreme flood.
      webhook: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(300, "60 s"),
        prefix: "meetai/rl/webhook",
      }),
    }
  : { token: null, webhook: null };

/**
 * Returns true if the request is allowed, false if it should be rejected (429).
 * Fails OPEN when rate limiting is disabled or Redis is unreachable.
 */
export async function rateLimitOk(
  bucket: Bucket,
  identifier: string,
): Promise<boolean> {
  const limiter = limiters[bucket];
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(identifier);
    return success;
  } catch (err) {
    console.error("[ratelimit] Redis error — failing open:", err);
    return true;
  }
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
