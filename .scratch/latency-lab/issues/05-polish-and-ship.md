# 05: Polish and ship

**What to build:** The public artifact. Final dark monospace visual treatment, mobile viewport sanity, deployment to the simons.workers.dev subdomain under the agreed worker name, and the full manual smoke checklist passed against the live URL.

**Blocked by:** 04 (pause and recover).

**Status:** ready-for-agent

- [x] Dark background with monospace numerals applied consistently; digits do not shift horizontally as values change
- [x] Page is usable and legible at phone viewport size
- [x] Deployed and reachable at the production URL
- [ ] Manual smoke checklist passes against production: connect, scroll, readouts, verdict, tab-hide pause, airplane-mode drop and recovery

## Comments

- 2026-08-25: Polish implemented by subagent (tokenized palette, tabular-nums inherited globally, fluid clamps, CSS-box-as-single-source-of-truth canvas geometry). Behavior paths untouched; tsc clean, 24 tests green.
- 2026-08-25: Deployed via `npx wrangler deploy` (existing OAuth session). Production smoke against https://latency-lab.simons.workers.dev : `GET /` returned 200 with title "Latency Lab", `/ws` without upgrade headers correctly rejected 426. Version e2903104.
