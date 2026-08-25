# 03: Window, sparkline, verdict

**What to build:** The actual instrument. The client maintains a rolling Window of 300 Samples, draws it as a scrolling vanilla-canvas sparkline, shows p50/p95/jitter readouts from the measurement mathematics module, and renders the Verdict with its thresholds visible. This is everything the spec promises visually.

**Blocked by:** 01 (skeleton and live pulse), 02 (measurement mathematics).

**Status:** ready-for-agent

- [ ] The sparkline scrolls continuously at the sampling cadence, showing about 30 seconds of history
- [ ] p50, p95, and jitter readouts update live and agree with hand-checked values from the seam functions
- [ ] The Verdict displays excellent/good/rough and changes color accordingly
- [ ] The verdict thresholds are visible somewhere on the page so ratings are explainable
- [ ] No dependencies and no build step were introduced

## Comments

- 2026-08-25: Implemented by subagent; two-axis review returned zero critical/major across both axes, mirror math verified line-by-line faithful to src/measurement/index.ts.
- 2026-08-25: Known tradeoff accepted: y-range autoscales to absolute window min/max per redraw, so a single outlier spike rescales the chart momentarily. A decayed-max would be steadier if this ever annoys anyone.
