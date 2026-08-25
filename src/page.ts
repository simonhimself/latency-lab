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
</style>
</head>
<body>
  <span id="pill" class="pill connecting">connecting</span>
  <div class="label">round trip</div>
  <div id="rtt">&mdash;</div>
  <div class="label">edge colo</div>
  <div id="colo">&mdash;</div>

<script>
(function () {
  'use strict';

  var pillEl = document.getElementById('pill');
  var rttEl = document.getElementById('rtt');
  var coloEl = document.getElementById('colo');

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
          rttEl.textContent = (performance.now() - msg.t).toFixed(1);
        } else if (typeof msg.colo === 'string' && msg.colo.length > 0) {
          coloEl.textContent = msg.colo;
        }
      }
    };

    // rtt/colo are deliberately left frozen at last-known values here.
    socket.onerror = function () {};
    socket.onclose = function () {
      reconnectWithBackoff();
    };
  }

  connect();
})();
</script>
</body>
</html>`;
