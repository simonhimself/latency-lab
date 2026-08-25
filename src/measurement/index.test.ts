import { describe, expect, it } from "vitest";

import { nextBackoffMs, summarize, verdict } from "./index";

const sample = (rttMs: number) => ({ rttMs });

describe("summarize", () => {
  it("throws a RangeError for an empty Window", () => {
    expect(() => summarize([])).toThrow(RangeError);
  });

  it("returns the single sample as both percentiles and zero jitter", () => {
    expect(summarize([sample(15)])).toEqual({ p50: 15, p95: 15, jitter: 0 });
  });

  it("computes p50 and p95 by nearest rank on sorted values", () => {
    // sorted [20, 20, 30]: p50 = ceil(0.5*3)=2nd -> 20; p95 = ceil(0.95*3)=3rd -> 30
    const metrics = summarize([sample(20), sample(30), sample(20)]);
    expect(metrics.p50).toBe(20);
    expect(metrics.p95).toBe(30);
    // jitter in original order: (|30-20| + |20-30|) / 2 = 10
    expect(metrics.jitter).toBe(10);
  });

  it("measures jitter across consecutive samples in ORIGINAL order, not sorted order", () => {
    // original diffs: |40-10| + |10-40| = 60 -> mean 30 (sorted would give 15)
    const metrics = summarize([sample(10), sample(40), sample(10)]);
    expect(metrics.jitter).toBe(30);
  });

  it("returns zero jitter and matching percentiles when all values are tied", () => {
    expect(summarize([sample(7), sample(7), sample(7), sample(7)])).toEqual({
      p50: 7,
      p95: 7,
      jitter: 0,
    });
  });

  it("keeps p50 stable while p95 jumps to the outlier", () => {
    const window = [
      sample(20),
      sample(20),
      sample(20),
      sample(20),
      sample(20),
      sample(20),
      sample(20),
      sample(20),
      sample(20),
      sample(500),
    ];
    const metrics = summarize(window);
    expect(metrics.p50).toBe(20);
    expect(metrics.p95).toBe(500);
  });
});

describe("verdict", () => {
  it.each([
    { label: "just under the excellent pair", p50: 39.999, jitter: 9.999, expected: "excellent" },
    { label: "exactly at the excellent pair", p50: 40, jitter: 10, expected: "good" },
    { label: "just over the excellent pair", p50: 40.001, jitter: 10.001, expected: "good" },
    { label: "p50 over excellent but jitter fine", p50: 40.001, jitter: 9, expected: "good" },
    { label: "jitter over excellent but p50 fine", p50: 39, jitter: 10.001, expected: "good" },
    { label: "just under the good pair", p50: 119.999, jitter: 29.999, expected: "good" },
    { label: "exactly at the good pair", p50: 120, jitter: 30, expected: "rough" },
    { label: "just over the good pair", p50: 120.001, jitter: 30.001, expected: "rough" },
    { label: "p50 under good limit but jitter exactly at limit", p50: 119.999, jitter: 30, expected: "rough" },
    { label: "jitter under good limit but p50 exactly at limit", p50: 120, jitter: 29.999, expected: "rough" },
  ])("$label -> $expected", ({ p50, jitter, expected }) => {
    expect(verdict({ p50, jitter })).toBe(expected);
  });
});

describe("nextBackoffMs", () => {
  it.each([
    [0, 500],
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 5000],
    [5, 5000],
  ])("attempt %i -> %ims", (attempt, expected) => {
    expect(nextBackoffMs(attempt)).toBe(expected);
  });

  it("never exceeds the 5000ms cap", () => {
    for (let attempt = 0; attempt <= 20; attempt++) {
      expect(nextBackoffMs(attempt)).toBeLessThanOrEqual(5000);
    }
  });

  it("rejects negative attempts with a RangeError", () => {
    expect(() => nextBackoffMs(-1)).toThrow(RangeError);
  });
});
