# 04: Pause and recover

**What to build:** Resilience behavior. Hiding the tab pauses sampling cleanly and returns resume it. Losing the network flips the pill to reconnecting, climbs exponential backoff toward its cap, freezes the existing Window and graph rather than wiping, then restores live sampling automatically when the connection returns.

**Blocked by:** 03 (window, sparkline, verdict).

**Status:** ready-for-agent

- [ ] With the tab hidden, no samples accumulate; on return, sampling resumes into the same Window
- [ ] Killing connectivity flips the pill to reconnecting within a couple seconds
- [ ] Backoff delays between attempts follow nextBackoffMs up to the 5-second cap
- [ ] While disconnected, the graph and readouts freeze instead of resetting
- [ ] Restoring connectivity returns the pill to live and sampling resumes without manual reload

## Comments

- 2026-08-25: Implemented by subagent. Honest finding: most resilience behavior already existed from tickets 01-03; the real gaps closed were an overlapping-reconnect timer guard and stale-socket handler identity checks (race conditions, not features).
- 2026-08-25: Review returned zero critical/major; one minor applied (stopSampling() hoisted into connect() so the single-interval invariant is local, not emergent). Reviewer nit recorded: background tab throttling may stretch nominal backoff delays while hidden; correct behavior, documented here rather than in code.
