/**
 * Mock server for the Playwright suite: REST auth, the socket protocol, and a fixture replayer.
 *
 * The frontend's e2e tests run against this, not against the real backend
 * (`docs/07-frontend.md` §9) — the repos are independent and the client must be diagnosable
 * without standing up a database. It speaks the same contract, and what it replays is not
 * invented: `test-fixtures/` is synced from `backend/dist-fixtures/`, which is real games from the
 * M2 soak, projected for one seat by the engine that passes the conformance gate. FE and BE are
 * tested against literally the same data.
 *
 * What it deliberately does **not** do is decide anything. It walks a recorded script: emit the
 * events up to the next decision, offer exactly the options that seat was offered, and check the
 * client's answer is one of them. The hand then plays out as it was recorded whatever the client
 * picked — which is fine, because the point is that the client renders the right options and
 * sends a well-formed action, not that the mock can adjudicate mahjong.
 */

import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Server } from 'socket.io';

const PORT = Number(process.env.MOCK_PORT ?? 3000);
const PROTOCOL_VERSION = Number(process.env.MOCK_PROTOCOL_VERSION ?? 1);
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');

/** Gap between scripted events. Slow enough that the client's dwell keeps up without catching up. */
const EMIT_GAP_MS = Number(process.env.MOCK_EMIT_GAP_MS ?? 45);
const PROMPT_WINDOW_MS = Number(process.env.MOCK_PROMPT_MS ?? 60_000);

const ORIGINS = ['http://localhost:4300', 'http://127.0.0.1:4300'];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixtures = new Map();
for (const name of readdirSync(FIXTURE_DIR)) {
  if (!name.endsWith('.json') || name === 'manifest.json') continue;
  fixtures.set(
    name.replace(/\.json$/, ''),
    JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')),
  );
}

/** Which fixture the next table plays. Tests set it with `POST /control/fixture`. */
let selectedFixture = process.env.MOCK_FIXTURE ?? 'chankan';
/** Freeze the replay at this step. The visual suite needs a board that is not moving. */
let selectedStopAt = null;
/**
 * Whether running out of script ends the *game*.
 *
 * A fixture is one hand of a longer game, so by default the replay simply stops — claiming the
 * game is over would put a results screen over every test that plays a hand to its end. The
 * results screen has a test of its own that asks for this.
 */
let selectedEndGame = false;

/** Two actions with the same key are the same choice — the server's `wireActionKey`, restated. */
function actionKey(action) {
  switch (action?.type) {
    case 'discard':
      return `discard:${action.tile}:${action.riichi === true ? 'r' : ''}`;
    case 'chi':
    case 'pon':
      return `${action.type}:${[...action.tiles].sort().join(',')}`;
    case 'shouminkan':
      return `shouminkan:${action.tile}`;
    case 'ankan':
      return `ankan:${action.kind}`;
    default:
      return String(action?.type);
  }
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

let userCounter = 0;
const users = new Map();

function tokensFor(user) {
  return {
    accessToken: `access.${user.id}`,
    refreshToken: `refresh.${user.id}.${String(Date.now())}`,
    expiresIn: 900,
    user,
  };
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      try {
        resolve(raw.length > 0 ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(body));
}

const http = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    send(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? '/', `http://127.0.0.1:${String(PORT)}`);

  if (url.pathname === '/health') {
    send(response, 200, {
      status: 'ok',
      mock: true,
      protocolVersion: PROTOCOL_VERSION,
      fixtures: [...fixtures.keys()],
    });
    return;
  }

  if (url.pathname === '/control/fixture' && request.method === 'POST') {
    void readBody(request).then((body) => {
      if (typeof body.name === 'string' && fixtures.has(body.name)) {
        selectedFixture = body.name;
        selectedStopAt = typeof body.stopAt === 'number' ? body.stopAt : null;
        selectedEndGame = body.endGame === true;
        send(response, 200, {
          fixture: selectedFixture,
          stopAt: selectedStopAt,
          endGame: selectedEndGame,
        });
      } else {
        send(response, 400, { known: [...fixtures.keys()] });
      }
    });
    return;
  }

  if (url.pathname === '/control/afk' && request.method === 'POST') {
    void readBody(request).then((body) => {
      io.emit('player:afk', { seat: Number(body.seat ?? 0), takenOverByBot: true });
      send(response, 200, { ok: true });
    });
    return;
  }

  if (url.pathname.startsWith('/auth/')) {
    void readBody(request).then((body) => {
      switch (url.pathname) {
        case '/auth/guest': {
          userCounter += 1;
          const user = {
            id: `guest-${String(userCounter)}`,
            displayName: `Guest-${String(1000 + userCounter)}`,
            email: null,
            isGuest: true,
            avatarId: 'a1',
          };
          users.set(user.id, user);
          send(response, 200, tokensFor(user));
          return;
        }
        case '/auth/login': {
          if (typeof body.password !== 'string' || body.password.length < 8) {
            send(response, 401, { code: 'INVALID_CREDENTIALS', message: 'no such account' });
            return;
          }
          send(
            response,
            200,
            tokensFor({
              id: 'user-1',
              displayName: 'Kaori',
              email: body.email ?? 'kaori@example.test',
              isGuest: false,
              avatarId: 'a2',
            }),
          );
          return;
        }
        case '/auth/register':
        case '/auth/upgrade': {
          const user = {
            id: 'user-1',
            displayName: body.displayName ?? 'Kaori',
            email: body.email ?? 'kaori@example.test',
            isGuest: false,
            avatarId: 'a2',
          };
          users.set(user.id, user);
          send(response, 200, tokensFor(user));
          return;
        }
        case '/auth/refresh': {
          const user = users.values().next().value ?? {
            id: 'guest-1',
            displayName: 'Guest-1001',
            email: null,
            isGuest: true,
            avatarId: 'a1',
          };
          send(response, 200, tokensFor(user));
          return;
        }
        default:
          send(response, 200, { ok: true });
      }
    });
    return;
  }

  send(response, 404, { error: 'not found' });
});

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

const io = new Server(http, {
  transports: ['websocket'],
  cors: { origin: ORIGINS, credentials: true },
});

let tableCounter = 0;

/** One replay per socket. Enough: the suite runs a single client at a time. */
class Replay {
  constructor(socket, fixture, tableId, stopAt, endGame) {
    this.socket = socket;
    this.fixture = fixture;
    this.tableId = tableId;
    this.stopAt = stopAt;
    this.endGame = endGame;
    this.cursor = 0;
    this.promptCounter = 0;
    this.pending = null;
    this.timer = null;
  }

  snapshot() {
    this.socket.emit('game:snapshot', {
      seq: this.fixture.snapshot.seq,
      view: { ...this.fixture.snapshot, tableId: this.tableId },
    });
  }

  /** Reconnect and resync both replay from the top: snapshot, then everything applied since. */
  resync() {
    this.stop();
    this.snapshot();
    for (const step of this.fixture.steps.slice(0, this.cursor)) {
      if (step.t === 'event') {
        this.socket.emit('game:event', { seq: step.seq, ts: Date.now(), payload: step.event });
      }
    }
    if (this.pending === null) this.advance();
    else this.socket.emit('game:prompt', this.pending.prompt);
  }

  stop() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  advance() {
    this.stop();
    if (this.stopAt !== null && this.cursor >= this.stopAt) return;
    const step = this.fixture.steps[this.cursor];
    if (step === undefined) {
      if (!this.endGame) return;
      this.socket.emit('game:ended', {
        tableId: this.tableId,
        placements: [0, 1, 2, 3].map((seat) => ({
          seat,
          place: seat + 1,
          finalScore: this.fixture.final.scores[seat],
          netScore: 0,
        })),
        seed: this.fixture.seed,
        seedHash: 'mock',
      });
      return;
    }

    if (step.t === 'prompt') {
      this.promptCounter += 1;
      const prompt = {
        promptId: `p${String(this.promptCounter)}`,
        seat: this.fixture.mySeat,
        options: step.options,
        deadline: Date.now() + PROMPT_WINDOW_MS,
        bankRemaining: 20,
      };
      this.pending = { prompt, answer: step.answer };
      if (process.env.MOCK_DEBUG) console.log('[mock] prompt', this.cursor, prompt.promptId);
      this.socket.emit('game:prompt', prompt);
      return;
    }

    if (process.env.MOCK_DEBUG) console.log('[mock] event', this.cursor, step.event.t);
    this.socket.emit('game:event', { seq: step.seq, ts: Date.now(), payload: step.event });
    this.cursor += 1;
    this.timer = setTimeout(() => this.advance(), EMIT_GAP_MS);
  }

  answer(payload) {
    if (this.pending === null) {
      return { ok: false, error: { code: 'STALE_PROMPT', message: 'nothing is pending' } };
    }
    if (payload.promptId !== this.pending.prompt.promptId) {
      return { ok: false, error: { code: 'STALE_PROMPT', message: 'that prompt has gone' } };
    }
    const offered = new Set(this.pending.prompt.options.map(actionKey));
    if (!offered.has(actionKey(payload.action))) {
      return { ok: false, error: { code: 'ILLEGAL_ACTION', message: 'that was not on offer' } };
    }

    this.socket.emit('game:promptCancelled', {
      promptId: this.pending.prompt.promptId,
      reason: 'resolved',
    });
    this.pending = null;
    this.cursor += 1;
    this.timer = setTimeout(() => this.advance(), EMIT_GAP_MS);
    return { ok: true };
  }
}

function bot(seat) {
  return {
    userId: null,
    displayName: `Bot ${String(seat)}`,
    avatarId: 'bot',
    isBot: true,
    botLevel: 'normal',
  };
}

/**
 * Seat the host where the real server seats them: the **first `open` seat**
 * (`docs/05-realtime-protocol.md` §3, and `TableService.create()` implements exactly that).
 *
 * This used to put the player in seat 0 whatever the client had sent, which made the
 * create-a-table flow pass end to end while the real backend left the creator unseated and three
 * bots playing without them. A mock more forgiving than the server it stands in for is a mock that
 * certifies bugs, so this one seats by the same rule and refuses the same payloads.
 */
function seatHost(seats, player) {
  const target = seats.findIndex((seat) => seat.config.fill === 'open' && seat.player === null);
  if (target === -1) return null;
  seats[target].player = player;
  return target;
}

/**
 * `table` is what `table:create` asked for: `{ seats, length, private }`, or `null` before anything
 * has been created.
 *
 * One simplification worth knowing about: the seat the host is given here has nothing to do with
 * the fixture's `mySeat`. The pre-game screen reads this, and the board reads the snapshot, and the
 * two never have to agree for anything under test — but do not build an assertion that assumes
 * they do.
 */
function tableState(tableId, status, player, table) {
  const seats = [0, 1, 2, 3].map((seat) => {
    const config = table?.seats?.[seat] ?? {
      fill: seat === 0 ? 'open' : 'bot',
      botLevel: 'normal',
    };
    return {
      seat,
      config,
      player: config.fill === 'bot' ? bot(seat) : null,
      ready: false,
      connection: 'online',
    };
  });

  const hostSeat = seatHost(seats, player);
  for (const seat of seats) {
    // Empty non-bot seats become bots at start, exactly as `fillEmptySeatsWithBots` does.
    if (seat.player === null && status !== 'waiting') seat.player = bot(seat.seat);
    seat.ready = seat.player !== null && seat.seat !== hostSeat;
  }

  return {
    tableId,
    status,
    hostUserId: player.userId,
    config: fixtures.get(selectedFixture)?.snapshot.config ?? null,
    length: table?.length ?? 'hanchan',
    isPrivate: table?.private === true,
    inviteCode: 'MOCK42',
    seats,
    gameId: status === 'in_progress' ? 'game-1' : null,
  };
}

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
      message: `protocol ${String(claimed)} is not supported; server speaks ${String(PROTOCOL_VERSION)}`,
    });
    socket.disconnect(true);
    return;
  }

  const userId = String(auth.token ?? '').replace(/^access\./, '') || null;
  const player = {
    userId,
    displayName: users.get(userId)?.displayName ?? 'You',
    avatarId: 'a1',
    isBot: false,
    botLevel: null,
  };

  socket.emit('session:hello', {
    protocolVersion: PROTOCOL_VERSION,
    serverTime: Date.now(),
    userId,
  });
  socket.emit('user:activeTable', { tableId: null });

  const session = { tableId: null, replay: null, table: null };

  const start = () => {
    const fixture = fixtures.get(selectedFixture);
    if (fixture === undefined || session.tableId === null || session.replay !== null) return;
    socket.emit('table:state', tableState(session.tableId, 'in_progress', player, session.table));
    socket.emit('game:started', {
      tableId: session.tableId,
      players: fixture.snapshot.players.map((seat) => seat.player),
      config: fixture.snapshot.config,
      seedHash: 'mock',
    });
    session.replay = new Replay(socket, fixture, session.tableId, selectedStopAt, selectedEndGame);
    session.replay.snapshot();
    session.replay.advance();
  };

  socket.on('table:create', (payload, ack) => {
    const seats = payload?.seats ?? [];
    // The same refusal the gateway makes: a table with no open seat has nowhere for its creator.
    if (!seats.some((seat) => seat.fill === 'open')) {
      ack({
        ok: false,
        error: {
          code: 'ILLEGAL_ACTION',
          message: 'at least one seat must be open for you to sit in',
        },
      });
      return;
    }
    tableCounter += 1;
    session.tableId = `table-${String(tableCounter)}`;
    session.table = { seats, length: payload?.length, private: payload?.private };
    const state = tableState(session.tableId, 'waiting', player, session.table);
    ack({ ok: true, tableId: session.tableId, inviteCode: 'MOCK42' });
    socket.emit('table:state', state);
  });

  socket.on('lobby:quickmatch', (_payload, ack) => {
    ack({ ok: true, ticketId: 'ticket-1' });
    socket.emit('lobby:queueStatus', { position: 1, waiting: 1, etaSeconds: 20 });
    tableCounter += 1;
    session.tableId = `table-${String(tableCounter)}`;
    setTimeout(() => {
      socket.emit('lobby:matched', { tableId: session.tableId });
    }, 60);
  });

  socket.on('lobby:cancel', (_payload, ack) => {
    ack({ ok: true });
  });

  socket.on('table:join', (payload, ack) => {
    session.tableId = payload.tableId ?? session.tableId ?? 'table-1';
    ack({ ok: true, tableId: session.tableId });
    socket.emit(
      'table:state',
      tableState(
        session.tableId,
        session.replay === null ? 'waiting' : 'in_progress',
        player,
        session.table,
      ),
    );
    if (session.replay !== null) session.replay.resync();
  });

  socket.on('table:ready', (_payload, ack) => {
    ack({ ok: true });
    setTimeout(start, 30);
  });

  socket.on('table:start', (_payload, ack) => {
    ack({ ok: true });
    setTimeout(start, 30);
  });

  socket.on('table:leave', (_payload, ack) => {
    session.replay?.stop();
    session.replay = null;
    ack({ ok: true });
  });

  socket.on('table:setSeat', (_payload, ack) => {
    ack({ ok: true });
  });

  socket.on('game:stamp', (_payload, ack) => {
    ack({ ok: true });
  });

  socket.on('game:action', (payload, ack) => {
    if (process.env.MOCK_DEBUG) {
      console.log('[mock] action', JSON.stringify(payload), 'cursor', session.replay?.cursor);
    }
    ack(
      session.replay?.answer(payload) ?? {
        ok: false,
        error: { code: 'TABLE_NOT_FOUND', message: 'no game' },
      },
    );
  });

  socket.on('game:resync', (_payload, ack) => {
    ack({ ok: true });
    session.replay?.resync();
  });

  socket.on('disconnect', () => {
    session.replay?.stop();
  });
});

http.listen(PORT, '127.0.0.1', () => {
  console.log(
    `mock server on http://127.0.0.1:${String(PORT)} (protocol v${String(PROTOCOL_VERSION)}, ` +
      `${String(fixtures.size)} fixtures, default "${selectedFixture}")`,
  );
});
