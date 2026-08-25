# 01: Skeleton and live pulse

**What to build:** The tracer bullet. A stateless Worker serving a minimal page that opens a WebSocket to the same origin, gets it accepted by the Echo endpoint via WebSocketPair in the caller's nearest colo, and shows a raw RTT count refreshing ten times per second plus the serving colo code, with a State pill transitioning connecting to live. Ugly but complete: the entire path from browser through edge and back exists.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Opening the page connects automatically and the pill reaches live
- [ ] A bare RTT number updates at the sampling cadence
- [ ] The colo code served is visible on the page
- [ ] The server holds no state and stores nothing anywhere
- [ ] Verified locally via wrangler dev before any deploy
