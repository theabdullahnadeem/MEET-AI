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

type Bucket = "token" | "webhook" | "mutation";

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
      // S-3: sensitive tRPC mutations (knocks, activation, chat tokens) —
      // per-user+procedure, far above any legitimate clicking.
      mutation: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "60 s"),
        prefix: "meetai/rl/mutation",
      }),
    }
  : { token: null, webhook: null, mutation: null };

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

// ---------------------------------------------------------------------------
// S-3: distributed storage for better-auth's built-in rate limiter (sign-in /
// sign-up / 2FA brute-force protection). Its default in-memory store is
// per-serverless-instance on Vercel — effectively no protection. When Upstash
// isn't configured this exports undefined and better-auth falls back to the
// memory store, which is fine for local dev. All operations fail OPEN.

interface AuthRateLimitEntry {
  key: string;
  count: number;
  lastRequest: number;
}

const AUTH_RL_PREFIX = "meetai/rl/auth";

export const authRateLimitStorage = redis
  ? {
      get: async (key: string) => {
        try {
          const data = await redis.get<AuthRateLimitEntry>(
            `${AUTH_RL_PREFIX}/${key}`,
          );
          return data ?? null;
        } catch (err) {
          console.error("[ratelimit] auth get failed — failing open:", err);
          return null;
        }
      },
      set: async (key: string, value: AuthRateLimitEntry) => {
        try {
          // TTL comfortably above the largest rule window (60 s).
          await redis.set(`${AUTH_RL_PREFIX}/${key}`, JSON.stringify(value), {
            ex: 600,
          });
        } catch (err) {
          console.error("[ratelimit] auth set failed — failing open:", err);
        }
      },
      // Atomic counter path (preferred by better-auth when present): INCR +
      // EXPIRE gives correct counting across concurrent serverless instances.
      consume: async (key: string, rule: { window: number; max: number }) => {
        try {
          const counterKey = `${AUTH_RL_PREFIX}/c/${key}`;
          const count = await redis.incr(counterKey);
          if (count === 1) {
            await redis.expire(counterKey, rule.window);
          }
          if (count <= rule.max) {
            return { allowed: true as const, retryAfter: null };
          }
          const ttl = await redis.ttl(counterKey);
          return {
            allowed: false as const,
            retryAfter: ttl > 0 ? ttl : rule.window,
          };
        } catch (err) {
          console.error("[ratelimit] auth consume failed — failing open:", err);
          return { allowed: true as const, retryAfter: null };
        }
      },
    }
  : undefined;
