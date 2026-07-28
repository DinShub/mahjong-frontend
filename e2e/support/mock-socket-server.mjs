/**
 * Mock socket server for the Playwright suite.
 *
 * The frontend's e2e tests run against this, not against the real backend
 * (`docs/07-frontend.md` §9) — the repos are independent and the client must be testable on its
 * own. It speaks the same contract: it validates the handshake and answers `session:hello`.
 *
 * From M4 it also replays canned `GameEvent[]` fixtures — the same fixtures the backend engine
 * tests produce, so both sides are tested against literally the same data.
 */

import { createServer } from 'node:http';

import { Server } from 'socket.io';

const PORT = Number(process.env.MOCK_PORT ?? 3000);
const PROTOCOL_VERSION = Number(process.env.MOCK_PROTOCOL_VERSION ?? 1);

const http = createServer((request, response) => {
  // Playwright polls this to know the server is up.
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', mock: true, protocolVersion: PROTOCOL_VERSION }));
    return;
  }
  response.writeHead(404).end();
});

const io = new Server(http, {
  transports: ['websocket'],
  cors: { origin: ['http://localhost:4300', 'http://127.0.0.1:4300'], credentials: true },
});

io.on('connection', (socket) => {
  const auth = socket.handshake.auth ?? {};
  const claimed = Number(auth.protocolVersion ?? socket.handshake.query.protocolVersion);

  if (!Number.isInteger(claimed)) {
    socket.emit('error', { code: 'BAD_REQUEST', message: 'protocolVersion is required' });
    socket.disconnect(true);
    return;
  }
  if (claimed !== PROTOCOL_VERSION) {
    socket.emit('error', {
      code: 'PROTOCOL_MISMATCH',
      message: `protocol ${claimed} is not supported; server speaks ${PROTOCOL_VERSION}`,
    });
    socket.disconnect(true);
    return;
  }

  socket.emit('session:hello', {
    protocolVersion: PROTOCOL_VERSION,
    serverTime: Date.now(),
    userId: null,
  });
});

http.listen(PORT, '127.0.0.1', () => {
  console.log(`mock socket server on http://127.0.0.1:${PORT} (protocol v${PROTOCOL_VERSION})`);
});
