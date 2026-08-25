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
  :root { color-scheme: dark; }
  html, body {
    margin: 0;
    height: 100%;
    background: #0b0e14;
    color: #e6edf3;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
    box-sizing: border-box;
  }
  .pill {
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid #30363d;
    color: #9aa7b3;
  }
  .pill.live         { color: #7ee787; border-color: #2ea04366; }
  .pill.connecting   { color: #e3b341; border-color: #bb800966; }
  .pill.reconnecting { color: #ff7b72; border-color: #f8514966; }
  .label {
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8b949e;
  }
  #rtt {
    font-size: clamp(56px, 14vw, 120px);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  #colo {
    font-size: 20px;
    letter-spacing: 0.2em;
    color: #79c0ff;
  }
  #spark {
    width: min(640px, 100%);
    height: 96px;
    border: 1px solid #21262d;
    border-radius: 8px;
    background: #0d1117;
  }
  .stats {
    display: flex;
    gap: 32px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .stat .value {
    font-size: 24px;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .verdict {
    font-size: clamp(22px, 5vw, 30px);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .verdict.excellent { color: #7ee787; }
  .verdict.good      { color: #e3b341; }
  .verdict.rough     { color: #ff7b72; }
  .legend {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: #8b949e;
    text-align: center;
  }
</style>
</head>
<body>
  <span id="pill" class="pill connecting">connecting</span>
  <div class="label">round trip</div>
  <div id="rtt">&mdash;</div>
  <div class="label">edge colo</div>
  <div id="colo">&mdash;</div>
  <canvas id="spark"></canvas>
  <div class="label">last ~30s</div>
  <div class="stats">
    <div class="stat"><span class="label">p50</span><span id="p50" class="value">&mdash;</span></div>
    <div class="stat"><span class="label">p95</span><span id="p95" class="value">&mdash;</span></div>
    <div class="stat"><span class="label">jitter</span><span id="jitter" class="value">&mdash;</span></div>
  </div>
  <div id="verdict" class="verdict">&mdash;</div>
  <div class="legend">excellent: p50 &lt; 40ms and jitter &lt; 10ms &middot; good: p50 &lt; 120ms and jitter &lt; 30ms &middot; otherwise rough</div>

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
  var WINDOW_SIZE = 300;
  var PLOT_HEIGHT = 96;

  // The rolling Window of RTT values behind the sparkline and the readouts.
  var samples = [];
  var plotWidth = 0;

  var wsUrl =
    (location.protocol === 'https:' ? 'wss://' : 'ws://') +
    location.host + '/ws';

  var socket = null;
  var attempt = 0;
  var sampleTimer = null;

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

  // Sends only while the page is visible; the interval keeps running across
  // tab hides so sampling resumes immediately on return without re-wiring.
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
    ctx.clearRect(0, 0, plotWidth, PLOT_HEIGHT);
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
        PLOT_HEIGHT - bottomPad -
        ((value - yMin) / (yMax - yMin)) * (PLOT_HEIGHT - topPad - bottomPad)
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
    plotWidth = rect.width;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(PLOT_HEIGHT * dpr));
    // Draw in CSS pixels while the backing store stays at device resolution.
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
    setTimeout(connect, delayMs);
  }

  function connect() {
    setPill('connecting');
    socket = new WebSocket(wsUrl);

    socket.onopen = function () {
      attempt = 0;
      setPill('live');
      stopSampling();
      sampleTimer = setInterval(sample, 100);
    };

    socket.onmessage = function (event) {
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

    // rtt/colo/readouts/graph are deliberately left frozen at last-known
    // values here; no new samples arrive while sampling is stopped, and draw()
    // only runs per sample or on resize, so the canvas never gets blanked.
    socket.onerror = function () {};
    socket.onclose = function () {
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
