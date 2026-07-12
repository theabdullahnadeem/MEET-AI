import { describe, expect, it } from "vitest";

import { escapeLike, formatDuration } from "./utils";

// F-08 regression: user search text must be matched literally, never as a
// LIKE wildcard pattern.
describe("escapeLike", () => {
  it("escapes percent wildcards", () => {
    expect(escapeLike("100%")).toBe("100\\%");
  });

  it("escapes underscore wildcards", () => {
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("escapes backslashes (the escape character itself)", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeLike("%_%")).toBe("\\%\\_\\%");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLike("weekly standup")).toBe("weekly standup");
  });

  it("handles the empty string", () => {
    expect(escapeLike("")).toBe("");
  });
});

describe("formatDuration", () => {
  it("renders whole minutes", () => {
    expect(formatDuration(120)).toBe("2 minutes");
  });

  it("rounds to the largest unit", () => {
    expect(formatDuration(3600)).toBe("1 hour");
  });

  it("renders seconds below a minute", () => {
    expect(formatDuration(45)).toBe("45 seconds");
  });
});
