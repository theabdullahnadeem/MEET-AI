import { describe, expect, it } from "vitest";

import { r2KeyFromStored } from "./r2";

// SEC-5 regression: stored media references come in two historical forms —
// bare object keys (current) and full public URLs (rows written before the
// bucket went private). Both must resolve to the same key.
describe("r2KeyFromStored", () => {
  it("passes bare keys through unchanged", () => {
    expect(r2KeyFromStored("recordings/abc123.mp4")).toBe(
      "recordings/abc123.mp4",
    );
  });

  it("extracts the key from a legacy public URL", () => {
    expect(
      r2KeyFromStored("https://pub-xyz.r2.dev/recordings/abc123.mp4"),
    ).toBe("recordings/abc123.mp4");
  });

  it("decodes percent-encoded characters in URL paths", () => {
    expect(
      r2KeyFromStored("https://pub-xyz.r2.dev/transcripts/a%20b.jsonl"),
    ).toBe("transcripts/a b.jsonl");
  });

  it("handles transcript keys with the C.5 .en suffix", () => {
    expect(r2KeyFromStored("transcripts/abc123.en.jsonl")).toBe(
      "transcripts/abc123.en.jsonl",
    );
  });

  it("is case-insensitive about the protocol", () => {
    expect(r2KeyFromStored("HTTPS://pub-xyz.r2.dev/recordings/a.mp4")).toBe(
      "recordings/a.mp4",
    );
  });
});
