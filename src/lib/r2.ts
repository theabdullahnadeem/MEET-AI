import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// SEC-5 / F-03: private media storage. The bucket no longer needs a public
// domain — reads go through short-lived presigned GET URLs minted with the
// same R2 credentials the app already uses for uploads (Egress + agent).

if (!process.env.R2_ENDPOINT) throw new Error("R2_ENDPOINT is not set");
if (!process.env.R2_ACCESS_KEY_ID) throw new Error("R2_ACCESS_KEY_ID is not set");
if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error("R2_SECRET_ACCESS_KEY is not set");
if (!process.env.R2_BUCKET) throw new Error("R2_BUCKET is not set");

export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Resolve a stored media reference to an R2 object key. Older rows store the
 * full public URL (`https://pub-xxx.r2.dev/recordings/<id>.mp4`); newer rows
 * store the bare key (`recordings/<id>.mp4`). Handles both so existing
 * meetings keep working after the bucket goes private.
 */
export function r2KeyFromStored(stored: string): string {
  if (/^https?:\/\//i.test(stored)) {
    try {
      return decodeURIComponent(new URL(stored).pathname.replace(/^\//, ""));
    } catch {
      return stored;
    }
  }
  return stored;
}

/**
 * Mint a short-lived presigned GET URL for an R2 object key.
 * Default TTL 10 minutes; the recording player uses 1 hour so long playback
 * sessions (and seek/range requests) don't outlive the URL.
 */
export async function presignR2Get(
  key: string,
  expiresInSeconds = 600,
): Promise<string> {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}
