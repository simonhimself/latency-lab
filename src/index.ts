// Latency Lab Worker (ticket 01: skeleton and live pulse).
// Stateless by design: no Durable Objects, no storage bindings, no in-memory
// session state. The /ws endpoint is a pure reflector so the measurement
// terminates in the caller's nearest colo rather than one pinned region.
import { PAGE_HTML } from './page';

export interface Env {}

function handleWebSocketUpgrade(request: Request): Response {
  const upgradeHeader = request.headers.get('upgrade');
  if (upgradeHeader === null || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('expected websocket upgrade', { status: 426 });
  }

  const pair = new WebSocketPair();
  const server = pair[1];

  server.accept();

  // One hello message with the serving colo, then pure byte-for-byte echo.
  const colo = request.cf?.colo ?? 'unknown';
  server.send(JSON.stringify({ colo }));

  // No-op close listener plus guard: a frame racing the peer's close must not
  // become an uncaught exception inside this handler.
  server.addEventListener('close', () => {});
  server.addEventListener('message', (event) => {
    try {
      // Text and binary both reflect; the product only ever sends text, but
      // the reflector contract in the spec promises bytes, not strings.
      if (typeof event.data === 'string' || event.data instanceof ArrayBuffer) {
        server.send(event.data);
      }
    } catch {
      // Socket died between message arrival and send. Nothing to do.
    }
  });

  return new Response(null, { status: 101, webSocket: pair[0] });
}

export default {
  async fetch(request, _env, _ctx): Promise<Response> {
    const url = new URL(request.url);

    // Path first, method second: unknown paths are 404 regardless of verb;
    // known paths with wrong verbs are 405 with the allowed methods.
    if (url.pathname !== '/' && url.pathname !== '/ws') {
      return new Response('not found', { status: 404 });
    }

    if (request.method !== 'GET') {
      return new Response('method not allowed', {
        status: 405,
        headers: { allow: 'GET' },
      });
    }

    if (url.pathname === '/') {
      return new Response(PAGE_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return handleWebSocketUpgrade(request);
  },
} satisfies ExportedHandler<Env>;
