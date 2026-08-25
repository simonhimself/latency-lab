// Pure measurement mathematics for Latency Lab. Zero I/O, zero browser APIs,
// zero nondeterminism: every function is a pure mapping of its arguments.

export type Sample = { readonly rttMs: number };

export type Window = readonly Sample[];

export type Metrics = {
  readonly p50: number;
  readonly p95: number;
  readonly jitter: number;
};

export type Verdict = "excellent" | "good" | "rough";

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5000;

// Nearest-rank percentile: the value at the ceil(fraction * n)-th position
// (1-indexed) of the ascending-sorted values.
function nearestRank(sortedRttMs: readonly number[], fraction: number): number {
  const rank = Math.ceil(fraction * sortedRttMs.length);
  return sortedRttMs[rank - 1]!;
}

export function summarize(window: Window): Metrics {
  if (window.length === 0) {
    throw new RangeError("summarize requires a non-empty Window");
  }

  const rtts = window.map((s) => s.rttMs);
  const sorted = [...rtts].sort((a, b) => a - b);

  let totalAbsDelta = 0;
  for (let i = 1; i < rtts.length; i++) {
    totalAbsDelta += Math.abs(rtts[i]! - rtts[i - 1]!);
  }
  // Mean absolute difference between consecutive samples in original order;
  // a single sample has no consecutive pairs, so jitter is exactly 0.
  const jitter = rtts.length > 1 ? totalAbsDelta / (rtts.length - 1) : 0;

  return { p50: nearestRank(sorted, 0.5), p95: nearestRank(sorted, 0.95), jitter };
}

export function verdict(metrics: { readonly p50: number; readonly jitter: number }): Verdict {
  if (metrics.p50 < 40 && metrics.jitter < 10) return "excellent";
  if (metrics.p50 < 120 && metrics.jitter < 30) return "good";
  return "rough";
}

export function nextBackoffMs(attempt: number): number {
  if (attempt < 0) {
    throw new RangeError(`attempt must be non-negative, got ${attempt}`);
  }
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}
