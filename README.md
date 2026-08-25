# Latency Lab

A private, real-time view of your own connection to the Cloudflare edge.

**Live**: https://latency-lab.simons.workers.dev

Open the page and it immediately starts pinging ten times per second, drawing a scrolling 30-second sparkline of round-trip times alongside p50/p95/jitter readouts and a plain-language verdict (excellent / good / rough). No install, no account, no configuration. Refresh wipes everything.

## Why this exists

Speed-test sites measure throughput to arbitrary servers and ignore jitter. Ping CLIs give numbers with no memory or context. When a connection feels slow, there was no quick honest instrument that answers: how fast right now, how wobbly, is that normal?

## How it leverages Cloudflare

**The edge is the instrument, not just the host.** The Worker accepts the WebSocket upgrade directly via `WebSocketPair` and runs in whichever colo is nearest *you*. Every measurement therefore terminates meters away in your own region instead of traveling to some pinned server in Virginia. That choice is the whole product: measure the edge you actually use.

**Deliberately no Durable Objects.** The obvious design pins one DO in one location, which quietly falsifies every reading for anyone far away. Latency Lab stays stateless on purpose: the reflector holds nothing, stores nothing, and costs nothing while idle. The reasoning is recorded in the spec under Implementation Decisions.

**Client-owned statistics.** The server is a dumb mirror. Your browser timestamps every ping, computes every percentile locally, and keeps every sample in memory only. Nothing about your network history ever lands on someone else's disk.

**Tiny by discipline.** The entire deployed Worker is ~6 KB gzipped including its inline UI, with zero dependencies and zero build steps. One TypeScript file serves the page; a second pure module holds the measurement mathematics behind the repo's only tested seam.

## What's cool about it

- **Honest geography.** It tells you which colo served you, so readings come with their context attached.
- **Ephemeral by design.** Fully private, fully forgettable. Close the tab and the evidence is gone.
- **A verdict you can argue with.** Bands are visible on the page itself (excellent: p50 < 40 ms and jitter < 10 ms; good: < 120 ms / < 30 ms), not hidden methodology.
- **Device duels.** Open it on WiFi and cellular side by side. No pairing, no accounts, just two tabs.
- **Resilience without ceremony.** Hide the tab and sampling pauses cleanly; kill your network mid-run and it freezes history, backs off, reconnects through airplane-mode toggles, and resumes into the same window gap-free.

## Built with an agentic spec-driven pipeline

This project was produced end-to-end by [Matt Pocock's agent skills](https://github.com/mattpocock/skills) running in [OpenCode](https://opencode.ai): `/grill-with-docs` interviewed the design (and caught that the Durable Object approach would break the product), `/to-spec` published the spec, `/to-tickets` split it into five tracer-bullet tickets with blocking edges, and subagents implemented each ticket with two-axis code review before every commit. The tickets and spec live under `.scratch/latency-lab/` as the paper trail.

## Development

```bash
npm install
npm test        # vitest, 24 tests on the measurement-math seam
npm run dev     # wrangler dev on localhost:8787
npx tsc --noEmit
```

Deploy:

```bash
npx wrangler deploy
```

## Structure

```
├── src/
│   ├── index.ts          # stateless Worker: GET / page, GET /ws echo via WebSocketPair
│   ├── page.ts           # the entire UI as an inline template string (no build step)
│   └── measurement/
│       ├── index.ts      # pure summarize / verdict / nextBackoffMs — the single test seam
│       └── index.test.ts # nearest-rank percentiles, band boundaries, backoff cap
├── wrangler.jsonc
└── .scratch/latency-lab/ # spec + tickets: the pipeline's paper trail
```

One known duplication, documented deliberately: the client mirrors the stats math inline because the page ships without a build step and cannot import the server module. Both copies carry cross-reference comments; the vitest suite pins the authoritative version.
