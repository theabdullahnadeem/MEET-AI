import "server-only";

// SEC-4 / F-04: bound server-side transcript fetches so a hostile or broken
// transcript URL can't hang the worker or exhaust memory. `content-length` is
// optional and can be missing or wrong (e.g. chunked), so the size limit is
// enforced while streaming the body, not from the header.
const TRANSCRIPT_FETCH_TIMEOUT_MS = 10_000;
const TRANSCRIPT_MAX_BYTES = 5_000_000; // 5 MB

/**
 * Fetch a transcript URL as text with a hard timeout and a streamed size cap.
 * Throws on timeout (AbortError) or when the body exceeds the cap.
 */
export async function fetchTranscriptText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TRANSCRIPT_FETCH_TIMEOUT_MS),
  });

  // Cheap fast-reject only when the server is honest about an oversized body.
  if (Number(res.headers.get("content-length") ?? 0) > TRANSCRIPT_MAX_BYTES) {
    throw new Error("transcript too large");
  }

  if (!res.body) {
    return res.text();
  }

  // Real enforcement: tally bytes as the body streams, cancel once over the cap.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.length;
    if (received > TRANSCRIPT_MAX_BYTES) {
      await reader.cancel();
      throw new Error("transcript too large");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks, received).toString("utf8");
}
