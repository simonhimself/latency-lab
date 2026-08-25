// Client page served by the Worker on GET /. Kept as a plain string so the
// browser JS stays out of TypeScript compilation (tsconfig has no DOM lib).
// No build step: everything inline, no external assets.
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Latency Lab</title>
<style>
  :root {
    color-scheme: dark;
    /* Single dark palette: one background ramp, one text ramp, one accent,
       three state hues. Every rule below consumes these tokens only. */
    --bg: #0b0e14;
    --surface: #0d1117;
    --border: #21262d;
    --border-strong: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #79c0ff;
    --ok: #7ee787;
    --warn: #e3b341;
    --bad: #ff7b72;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    /* Inherited everywhere: every digit on the page renders on a fixed
       advance width, so live-updating values never shift horizontally. */
    font-variant-numeric: tabular-nums;
  }
  body { display: flex; }
  /* margin:auto centers when the content fits and falls back to a scrolled,
     top-reachable column when the viewport is shorter than the instrument
     (landscape phones), instead of flex-clipping the top off-screen. */
  main {
    margin: auto;
    width: 100%;
    max-width: 640px;
    padding: 32px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    text-align: center;
  }
  .title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pill {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 5px 14px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    color: var(--muted);
  }
  .pill.live         { color: var(--ok);   border-color: rgba(46,160,67,0.45); background: rgba(46,160,67,0.08); }
  .pill.connecting   { color: var(--warn); border-color: rgba(187,128,9,0.45); background: rgba(187,128,9,0.08); }
  .pill.reconnecting { color: var(--bad);  border-color: rgba(248,81,73,0.45); background: rgba(248,81,73,0.08); }
  .label {
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  #colo {
    font-size: 20px;
    letter-spacing: 0.2em;
    color: var(--accent);
  }
  #rtt {
    font-size: clamp(56px, 14vw, 104px);
    line-height: 1;
  }
  /* Hero element: full column width, fluid height. The drawing code reads
     this box on every resize, so CSS stays the single source of truth. */
  .chart {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  #spark {
    display: block;
    width: 100%;
    height: clamp(96px, 20vh, 144px);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px 44px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .stat .value {
    font-size: 24px;
    line-height: 1.1;
  }
  .verdict {
    font-size: clamp(22px, 5vw, 28px);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .verdict.excellent { color: var(--ok); }
  .verdict.good      { color: var(--warn); }
  .verdict.rough     { color: var(--bad); }
  .legend {
    font-size: 11px;
    line-height: 1.7;
    letter-spacing: 0.04em;
    color: var(--muted);
    max-width: 46ch;
  }
</style>
</head>
<body>
  <main>
    <h1 class="title">latency lab</h1>
    <span id="pill" class="pill connecting">connecting</span>
    <section class="block">
      <div class="label">edge colo</div>
      <div id="colo">&mdash;</div>
    </section>
    <section class="block">
      <div class="label">round trip</div>
      <div id="rtt">&mdash;</div>
    </section>
    <section class="chart">
      <canvas id="spark"></canvas>
      <div class="label">last ~30s</div>
    </section>
    <section class="stats">
      <div class="stat"><span class="label">p50</span><span id="p50" class="value">&mdash;</span></div>
      <div class="stat"><span class="label">p95</span><span id="p95" class="value">&mdash;</span></div>
      <div class="stat"><span class="label">jitter</span><span id="jitter" class="value">&mdash;</span></div>
    </section>
    <div id="verdict" class="verdict">&mdash;</div>
    <div class="legend">excellent: p50 &lt; 40ms and jitter &lt; 10ms &middot; good: p50 &lt; 120ms and jitter &lt; 30ms &middot; otherwise rough</div>
  </main>

<script>
(function () {
  'use strict';

  var pillEl = document.getElementById('pill');
  var rttEl = document.getElementById('rtt');
  var coloEl = document.getElementById('colo');
  var p50El = document.getElementById('p50');
  var p95El = document.getElementById('p95');
  var jitterEl = document.getElementById('jitter');
  var verdictEl = document.getElementById('verdict');
  var canvas = document.getElementById('spark');
  var ctx = canvas.getContext('2d');

  // One sample every 100ms while visible -> 300 samples is about 30 seconds.
  // Plot geometry comes from the canvas CSS box (see #spark): resizeCanvas()
  // reads the rendered size on every resize/orientation change, so CSS stays
  // the single source of truth and the drawing surface can never disagree
  // with layout after a rotation.
  var WINDOW_SIZE = 300;

  // The rolling Window of RTT values behind the sparkline and the readouts.
  var samples = [];
  var plotWidth = 0;
  var plotHeight = 0;

  var wsUrl =
    (location.protocol === 'https:' ? 'wss://' : 'ws://') +
    location.host + '/ws';

  var socket = null;
  var attempt = 0;
  var sampleTimer = null;
  // Handle for a scheduled reconnect attempt. At most one may be pending at
  // any time: rapid close/open/close cycles must never stack multiple
  // setTimeout(connect) calls or orphaned sockets would race each other and
  // push duplicate samples into the Window.
  var reconnectTimer = null;

  function cancelPendingReconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function setPill(state) {
    pillEl.textContent = state;
    pillEl.className = 'pill ' + state;
  }

  function stopSampling() {
    if (sampleTimer !== null) {
      clearInterval(sampleTimer);
      sampleTimer = null;
    }
  }

  // Hidden-tab pause (ticket 04): sends only while visible; the interval keeps
  // running across tab hides so sampling resumes immediately on return without
  // re-wiring. While hidden no pings are sent, so no echoes arrive and draw()
  // is never called: neither the Window nor the canvas accumulates or redraws
  // anything. The Window itself is untouched while paused, so resumed samples
  // append to the same history rather than resetting it.
  function sample() {
    if (document.visibilityState !== 'visible') return;
    if (socket === null || socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify({ t: performance.now() }));
  }

  // ---------------------------------------------------------------------------
  // MIRROR of src/measurement/index.ts (summarize + verdict).
  // This page is a template string served with no build step, so it cannot
  // import the server's TS module; the math below is an inline copy that must
  // be kept in sync by hand:
  //   - nearest-rank percentiles (ceil(fraction * n), 1-indexed) over an
  //     ascending-sorted COPY, original array untouched
  //   - jitter = mean absolute difference of consecutive samples in ORIGINAL
  //     order; a single sample has no pairs so jitter is exactly 0
  //   - strict (<) band inequalities: excellent p50<40 AND jitter<10,
  //     good p50<120 AND jitter<30, otherwise rough
  //   - summarize throws RangeError on an empty Window (callers guard)
  // If you change one, change both.
  // ---------------------------------------------------------------------------
  function nearestRank(sortedRttMs, fraction) {
    var rank = Math.ceil(fraction * sortedRttMs.length);
    return sortedRttMs[rank - 1];
  }

  function summarize(rttMsWindow) {
    if (rttMsWindow.length === 0) {
      throw new RangeError('summarize requires a non-empty Window');
    }
    var sorted = rttMsWindow.slice().sort(function (a, b) { return a - b; });

    var totalAbsDelta = 0;
    for (var i = 1; i < rttMsWindow.length; i++) {
      totalAbsDelta += Math.abs(rttMsWindow[i] - rttMsWindow[i - 1]);
    }
    var jitter =
      rttMsWindow.length > 1 ? totalAbsDelta / (rttMsWindow.length - 1) : 0;

    return {
      p50: nearestRank(sorted, 0.5),
      p95: nearestRank(sorted, 0.95),
      jitter: jitter
    };
  }

  function verdict(metrics) {
    if (metrics.p50 < 40 && metrics.jitter < 10) return 'excellent';
    if (metrics.p50 < 120 && metrics.jitter < 30) return 'good';
    return 'rough';
  }
  // ---------------------------------------------------------------------------

  function pushSample(rttMs) {
    samples.push(rttMs);
    if (samples.length > WINDOW_SIZE) {
      samples.splice(0, samples.length - WINDOW_SIZE);
    }
  }

  function refreshReadouts() {
    // Mirror summarize throws on an empty Window; guard identically here.
    if (samples.length === 0) return;
    var metrics = summarize(samples);
    p50El.textContent = metrics.p50.toFixed(1);
    p95El.textContent = metrics.p95.toFixed(1);
    jitterEl.textContent = metrics.jitter.toFixed(1);

    var v = verdict(metrics);
    verdictEl.textContent = v;
    verdictEl.className = 'verdict ' + v;
  }

  function draw() {
    ctx.clearRect(0, 0, plotWidth, plotHeight);
    var n = samples.length;
    if (n === 0) return; // empty state: leave the plot blank until data arrives

    var min = samples[0];
    var max = samples[0];
    for (var i = 1; i < n; i++) {
      if (samples[i] < min) min = samples[i];
      if (samples[i] > max) max = samples[i];
    }
    // Auto-scale y to the window's range with padding; pad keeps flat windows
    // (min === max) off a division-by-zero and gives spikes breathing room.
    var pad = Math.max((max - min) * 0.15, 1);
    var yMin = min - pad;
    var yMax = max + pad;
    var topPad = 8;
    var bottomPad = 8;

    // Newest sample sits at the right edge; the line enters from the right
    // and scrolls left as the window fills toward WINDOW_SIZE.
    function xPos(index) {
      return ((WINDOW_SIZE - n + index) / (WINDOW_SIZE - 1)) * plotWidth;
    }
    function yPos(value) {
      return (
        plotHeight - bottomPad -
        ((value - yMin) / (yMax - yMin)) * (plotHeight - topPad - bottomPad)
      );
    }

    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (n === 1) {
      // Single sample cannot form a line segment; render it as a dot.
      ctx.fillStyle = '#79c0ff';
      ctx.beginPath();
      ctx.arc(xPos(0), yPos(samples[0]), 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.strokeStyle = '#79c0ff';
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(samples[0]));
    for (var j = 1; j < n; j++) {
      ctx.lineTo(xPos(j), yPos(samples[j]));
    }
    ctx.stroke();
  }

  function resizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    plotWidth = Math.max(1, rect.width);
    plotHeight = Math.max(1, rect.height);
    // Backing store tracks the CSS box at device resolution while drawing
    // happens in CSS pixels via the transform below, so the sparkline never
    // stretches when its fluid CSS size changes on rotation.
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function reconnectWithBackoff() {
    stopSampling();
    // Mirrors nextBackoffMs() in src/measurement/index.ts (500ms doubling,
    // 5000ms cap). Kept inline because this page is a template string with no
    // imports; if you change one, change both.
    var delayMs = Math.min(500 * Math.pow(2, attempt), 5000);
    attempt += 1;
    setPill('reconnecting');
    // Clear-before-schedule: even if a stale close event slipped through the
    // socket-identity guards below, only one reconnect may ever be pending.
    cancelPendingReconnect();
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  function connect() {
    // A previous cycle must not leak a second pending timer into this one.
    cancelPendingReconnect();
    // Make the single-interval invariant local to connect() rather than
    // emergent: even if a future caller invokes connect() while live,
    // the old sampling interval dies here.
    stopSampling();

    // Retire any surviving predecessor before replacing it: detach its
    // handlers (its late close/open events must not touch fresh state) and
    // ask it to close so no orphaned sockets accumulate.
    if (socket !== null) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    }

    setPill('connecting');
    var ws = new WebSocket(wsUrl);
    socket = ws;

    ws.onopen = function () {
      // Identity guard: a late event from a replaced socket is stale and
      // must not reset backoff, flip the pill, or start sampling.
      if (socket !== ws) return;
      attempt = 0;
      setPill('live');
      stopSampling();
      // Persistent interval: sample() self-gates on document.visibilityState,
      // so hidden tabs send nothing and the interval keeps ticking for an
      // immediate resume on return. Samples always append to the same Window,
      // which is never cleared on disconnect, so recovery continues the
      // existing history gap-free.
      sampleTimer = setInterval(sample, 100);
    };

    ws.onmessage = function (event) {
      var msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      if (msg !== null && typeof msg === 'object') {
        if (typeof msg.t === 'number') {
          var rtt = performance.now() - msg.t;
          rttEl.textContent = rtt.toFixed(1);
          pushSample(rtt);
          refreshReadouts();
          draw();
        } else if (typeof msg.colo === 'string' && msg.colo.length > 0) {
          coloEl.textContent = msg.colo;
        }
      }
    };

    // Frozen-history contract (ticket 04): on loss, nothing wipes state.
    // Sampling stops, draw() never runs again (it fires only per echo or on
    // resize), and readouts keep their last computed values from the frozen
    // Window, so verdict/readouts stay valid instead of erroring.
    ws.onerror = function () {};
    ws.onclose = function () {
      // Same identity guard as onopen: only the current socket may schedule
      // reconnection; a replaced socket's close is noise.
      if (socket !== ws) return;
      reconnectWithBackoff();
    };
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  connect();
})();
</script>
</body>
</html>`;
