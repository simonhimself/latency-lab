# 02: Measurement mathematics

**What to build:** The single automated seam of the product, built test-first. Pure functions that turn a Window of Samples into p50/p95/jitter metrics, metrics into an excellent/good/rough Verdict per the agreed bands, and reconnect attempt counts into capped exponential backoff delays. Green vitest suite is the deliverable.

**Blocked by:** None (can start immediately, independent of 01).

**Status:** ready-for-agent

- [ ] summarize handles empty Windows, a single Sample, tied values, and outlier-heavy distributions correctly
- [ ] verdict sits correctly at band boundaries: just under, exactly at, and just over each threshold pair
- [ ] nextBackoffMs grows exponentially across attempts and never exceeds the 5-second cap
- [ ] The module contains zero I/O and zero browser APIs
- [ ] All tests run green via vitest

## Comments

- 2026-08-25: Implemented strictly TDD by subagent: 24 tests green after red phase. Public shape settled as Sample objects ({ rttMs }), not bare numbers, matching spec vocabulary.
- 2026-08-25: Decision worth remembering: summarize() throws RangeError on an empty Window rather than returning NaNs. The startup UI must not call it before the first Sample exists.
