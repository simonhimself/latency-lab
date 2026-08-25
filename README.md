# Latency Lab

A tiny web page that shows how fast and stable your internet connection really is, right now.

**Try it**: https://latency-lab.simons.workers.dev

Open it and it starts measuring immediately. No sign-up, no install, nothing to configure. Close the tab and everything is forgotten.

## What you see

- **A live graph** of the last 30 seconds of ping times
- **Round trip (p50)**, the typical time your connection takes to reach a nearby server and back
- **Worst case (p95)**, where 19 out of 20 pings land faster. Spikes here are what make calls stutter
- **Jitter**, how much the timing wobbles from one ping to the next. Low jitter means smooth video calls and gaming
- **A rating** of your connection: excellent, good, or rough
- **The city** of the data center answering your pings

## When would I use this?

- Your video calls feel laggy and you want proof before blaming the router
- You want to compare WiFi against your phone's hotspot. Open the page on both devices
- You switched on a VPN or changed a setting and want to know what it did to your latency
- You're just curious how good your connection actually is

## How it works

The page sends a small ping to the nearest Cloudflare data center ten times per second and times each reply. Because the target is always the closest one available, the number reflects your real distance to the internet's edge rather than some far-away test server.

All the timing and math happen inside your browser. The server is just an echo that instantly forgets you. Nothing about your network gets stored anywhere.

## Reading the rating

The page rates your connection using two of the numbers above:

| Rating | Meaning |
| --- | --- |
| Excellent | Typical ping under 40 ms and jitter under 10 ms |
| Good | Typical ping under 120 ms and jitter under 30 ms |
| Rough | Anything slower or wobblier than that |

For context, a healthy home connection usually sits well inside the first row.

## Running it yourself

You need Node installed.

```bash
npm install
npm run dev     # starts a local copy at http://localhost:8787
npm test        # runs the tests
```

To put up your own copy on Cloudflare's free tier:

```bash
npx wrangler deploy
```
