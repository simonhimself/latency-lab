# Latency Lab

Status: ready-for-agent

A private, real-time view of your own connection to the Cloudflare edge.

## Problem Statement

A developer wants to know how fast and how stable their connection to the internet's edge actually is. Existing answers are poor. Speed-test sites measure throughput to arbitrary servers, hide their methodology, and ignore jitter entirely. Ping CLIs give raw numbers but no memory, no context about where packets went, and require a terminal. When a connection feels slow, there is no quick honest instrument that says: here is your round-trip time right now, here is how much it wobbles, here is whether that is normal.

## Solution

Latency Lab is a single web page. Open it and it immediately measures round-trip time to the nearest Cloudflare colo ten times per second, drawing a scrolling sparkline of the last 30 seconds alongside p50/p95/jitter readouts and a plain-language verdict. No install, no account, no configuration. Refreshing wipes everything; the tool keeps no history and stores nothing server-side. It works identically on phone and desktop, so comparing two devices is just opening it twice.

## User Stories

1. As a developer, I want to open a page and see my live connection latency immediately, so that I can check network quality without installing anything.
2. As a developer, I want a rolling graph of recent samples, so that I can see stability over time instead of a single misleading number.
3. As a developer, I want p50 and p95 readouts, so that I can distinguish typical performance from worst-case spikes.
4. As a developer, I want a jitter readout, so that I can tell whether my latency is steady or erratic at the same average.
5. As a non-expert, I want a plain-language verdict (excellent / good / rough), so that I can interpret numbers without knowing what good looks like.
6. As a non-expert, I want the verdict thresholds visible, so that I can understand why my connection was rated as it was.
7. As a developer, I want to see which colo served me, so that I know where my measurement terminated geographically.
8. As a developer, I want the echo endpoint running in my nearest colo rather than one fixed region, so that the measurement reflects my real edge distance.
9. As a visitor, I want a visible state pill showing connecting / live / reconnecting, so that I always know whether readings are trustworthy.
10. As a visitor, I want automatic reconnection after a network drop, so that a blip doesn't end my session.
11. As a visitor, I want the graph to freeze rather than wipe while disconnected, so that I keep the history I already collected.
12. As a visitor switching tabs, I want sampling to pause while hidden, so that background throttling never produces fake flat lines or garbage spikes.
13. As a privacy-minded user, I want all measurements kept only in my browser, so that nobody can observe my network history later.
14. As a returning user, I want a refresh to start clean, so that stale sessions never contaminate new measurements.
15. As a mobile user, I want the layout to work on a small viewport, so that I can compare my phone's connection on the go.
16. As a developer comparing networks, I want to open the page on two devices independently, so that I can contrast WiFi and cellular without any pairing step.
17. As a night-time user, I want a dark interface with monospace numerals, so that readings stay legible and digits don't jitter horizontally as values change.
18. As a curious visitor, I want updates arriving ten times per second, so that the instrument feels live rather than like a periodic poll.
19. As a developer, I want roughly thirty seconds of visible history, so that short trends (a spike, a recovery) are visible at a glance.
20. As a skeptic, I want the client itself to compute every statistic from raw timestamps, so that I trust the numbers come from where they claim.

## Implementation Decisions

- A single stateless Worker serves both the page and the WebSocket. `GET /` returns the UI. `GET /ws` upgrades via WebSocketPair and acts as the Echo endpoint.
- The Echo endpoint is a pure reflector: whatever bytes arrive come back unchanged. It holds no state, writes nothing anywhere, and runs in the colo nearest the caller. This is deliberate: a Durable Object would pin all users to one region and quietly falsify the measurement.
- The client owns all timing and computation. Each Sample is timestamped by the client before sending and timed on receipt; all statistics derive from those local timings.
- A pure measurement-mathematics module exposes three functions: summarize(Window) returning p50/p95/jitter metrics; verdict(metrics) returning excellent/good/rough per the agreed bands; nextBackoffMs(attempt) returning capped exponential reconnect delays. This module contains zero I/O and zero browser APIs.
- Sampling cadence: one ping every 100ms while the page is visible. The Window holds 300 Samples (about 30 seconds).
- Visibility handling: sampling pauses when the tab hides and resumes when it returns, driven by visibilitychange.
- Reconnect behavior: on socket loss the State pill shows reconnecting, attempts follow nextBackoffMs capped at 5 seconds, and the existing Window stays frozen on screen until a new connection goes live.
- Verdict bands: excellent requires p50 under 40ms and jitter under 10ms; good requires p50 under 120ms and jitter under 30ms; anything worse is rough.
- Rendering: vanilla canvas sparkline, no dependencies, no build step, dark background with monospace numerals.
- Identity: deployed as worker name latency-lab on the simons.workers.dev subdomain.

## Testing Decisions

- What makes a good test here: assert external behavior at the seam only. Feed arrays of Samples into the public functions, assert the numeric outputs. Never test private helpers, DOM code, or wiring.
- The single automated seam is the measurement-mathematics module. Test summarize for empty Windows, single Samples, tied values, and outlier-heavy distributions; test verdict at band boundaries (just under, exactly at, just over); test nextBackoffMs growth and its cap.
- No prior art exists (greenfield repo). These tests become the repo's first reference tests and prior art for future tools in this workspace.
- Everything outside the seam gets a manual smoke checklist: page loads, pill transitions live, graph scrolls, readouts update, tab-hide pauses, airplane-mode drop triggers reconnect, verdicts respond plausibly.

## Out of Scope

- Any persistence: session history, cross-session comparison, exports.
- Social features: shared sessions, leaderboards, spectator views.
- Accounts, authentication, abuse protection.
- Durable Objects anywhere in the design.
- Configurable cadence, window size, or threshold settings.
- Chart libraries, frameworks, bundlers, build steps.
- Automated browser testing infrastructure or CI pipelines.
- Packet-level tools (traceroute-style paths, loss measurement beyond what echo implies).

## Further Notes

Vocabulary used consistently across tickets and implementation:

- **Sample**: one client-timed RTT measurement.
- **Window**: the rolling 300-Sample buffer behind the sparkline.
- **Echo endpoint**: the stateless `/ws` reflector inside the Worker.
- **Verdict**: the excellent/good/rough classification derived from metrics.
- **State pill**: the connecting/live/reconnecting status indicator.

The decision to reject a Durable Object in favor of edge-local echo is the most likely future ADR candidate if domain-modeling gets installed later; the rationale lives above under Implementation Decisions.
