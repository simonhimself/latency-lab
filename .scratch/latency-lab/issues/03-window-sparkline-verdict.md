# 03: Window, sparkline, verdict

**What to build:** The actual instrument. The client maintains a rolling Window of 300 Samples, draws it as a scrolling vanilla-canvas sparkline, shows p50/p95/jitter readouts from the measurement mathematics module, and renders the Verdict with its thresholds visible. This is everything the spec promises visually.

**Blocked by:** 01 (skeleton and live pulse), 02 (measurement mathematics).

**Status:** ready-for-agent

- [ ] The sparkline scrolls continuously at the sampling cadence, showing about 30 seconds of history
- [ ] p50, p95, and jitter readouts update live and agree with hand-checked values from the seam functions
- [ ] The Verdict displays excellent/good/rough and changes color accordingly
- [ ] The verdict thresholds are visible somewhere on the page so ratings are explainable
- [ ] No dependencies and no build step were introduced
