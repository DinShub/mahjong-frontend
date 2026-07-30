import { Injectable, computed, inject, signal } from '@angular/core';
import type { OnDestroy } from '@angular/core';

import type {
  ClientToServerEvents,
  ProtocolError,
  ServerToClientEvents,
  SessionHelloPayload,
} from '@contracts/protocol';

import { APP_CONFIG, resolveUrl } from '@core/config/app-config';

import { SOCKET_FACTORY } from './socket.types';
import type { AckOf, ConnectionStatus, GameSocket, PayloadOf } from './socket.types';

const ACK_TIMEOUT_MS = 10_000;

/** Weight of the newest round-trip sample. Low enough that one slow ack is not "the connection". */
const RTT_SMOOTHING = 0.25;

type Listener = (...args: never[]) => void;

/**
 * Typed socket.io wrapper.
 *
 * Everything that talks to the server goes through here, so there is exactly one place that knows
 * the handshake, the reconnect policy and the connection state. State is signals — the app has no
 * client-side business logic to justify a reducer stack (`docs/07-frontend.md` §1).
 *
 * **Listeners are registered against the service, not the socket.** A store subscribes once, at
 * construction, and keeps receiving events across every reconnect and every token change; the
 * registry below is re-bound to each new underlying socket. The alternative — every store
 * resubscribing on every `connect` — is one missed edge away from a table that silently stops
 * updating.
 */
@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private readonly config = inject(APP_CONFIG);
  private readonly createSocket = inject(SOCKET_FACTORY);

  private socket: GameSocket | null = null;
  private accessToken: string | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();

  private readonly _status = signal<ConnectionStatus>('idle');
  private readonly _hello = signal<SessionHelloPayload | null>(null);
  private readonly _lastError = signal<ProtocolError | null>(null);
  private readonly _attempts = signal(0);
  private readonly _rttMs = signal<number | null>(null);
  private readonly _demoted = signal(false);

  readonly status = this._status.asReadonly();
  /** The server's greeting; `null` until the handshake completes. */
  readonly hello = this._hello.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  readonly reconnectAttempts = this._attempts.asReadonly();
  /** Smoothed round-trip time, from acknowledgement timings. `null` until the client acts. */
  readonly rttMs = this._rttMs.asReadonly();
  /** This tab was demoted by a newer one and may watch but not act. */
  readonly demoted = this._demoted.asReadonly();

  /** Connected *and* greeted — a transport-level connection alone is not a usable session. */
  readonly isConnected = computed(() => this._status() === 'connected' && this._hello() !== null);

  /**
   * Server clock minus local clock, in ms. Deadlines arrive as server epoch times, so the display
   * has to account for skew as well as RTT.
   */
  readonly clockSkewMs = computed(() => {
    const hello = this._hello();
    return hello === null ? null : hello.serverTime - this.helloReceivedAt;
  });

  private helloReceivedAt = 0;

  constructor() {
    this.on('session:demoted', () => {
      this._demoted.set(true);
    });
  }

  /**
   * Set the credential the handshake carries. Changing it while connected reconnects, because a
   * socket authenticated as a guest keeps believing it after that guest upgrades to an account.
   */
  setAccessToken(token: string | null): void {
    if (this.accessToken === token) return;
    this.accessToken = token;
    if (this.socket !== null) this.reconnect();
  }

  connect(): void {
    if (this.socket !== null) return;

    this._status.set('connecting');
    this._lastError.set(null);
    this._demoted.set(false);

    const url = resolveUrl(this.config.socketUrl, globalThis.location?.origin ?? '');
    const socket = this.createSocket(url, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.config.reconnect.maxAttempts,
      reconnectionDelay: this.config.reconnect.initialDelayMs,
      reconnectionDelayMax: this.config.reconnect.maxDelayMs,
      auth: {
        protocolVersion: this.config.protocolVersion,
        ...(this.accessToken === null ? {} : { token: this.accessToken }),
      },
    });
    this.socket = socket;

    socket.on('connect', () => {
      this._attempts.set(0);
      this._status.set('connected');
    });

    socket.on('session:hello', (payload) => {
      this.helloReceivedAt = Date.now();
      this._hello.set(payload);
      this._status.set('connected');
    });

    socket.on('disconnect', () => {
      this._hello.set(null);
      // A protocol mismatch is terminal: reconnecting cannot fix a client that is too old.
      if (this._status() !== 'protocol-mismatch') this._status.set('reconnecting');
    });

    socket.on('connect_error', (error: Error) => {
      this._attempts.update((count) => count + 1);
      if (this._status() !== 'protocol-mismatch') {
        this._status.set(this._attempts() > 1 ? 'reconnecting' : 'disconnected');
      }
      this._lastError.set({ code: 'INTERNAL', message: error.message });
    });

    socket.on('error', (error: ProtocolError) => {
      this._lastError.set(error);
      if (error.code === 'PROTOCOL_MISMATCH') {
        this._status.set('protocol-mismatch');
        socket.disconnect();
      }
    });

    this.bindRegistered(socket);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this._hello.set(null);
    if (this._status() !== 'protocol-mismatch') this._status.set('disconnected');
  }

  /** Drop the current socket and start over — the "retry" affordance in the connection UI. */
  reconnect(): void {
    this.disconnect();
    this._status.set('idle');
    this._attempts.set(0);
    this._demoted.set(false);
    this.connect();
  }

  /**
   * Subscribe to a server event. Returns an unsubscribe function.
   *
   * Safe before {@link connect} and across reconnects: the registry outlives the socket.
   */
  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): () => void {
    const handler = listener as Listener;
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(handler);
    this.listeners.set(event, set);
    bridge(this.socket)?.on(event, handler);

    return () => {
      set.delete(handler);
      bridge(this.socket)?.off(event, handler);
    };
  }

  /**
   * Send an event and wait for its acknowledgement. Every client→server event acknowledges, so
   * failures come back typed instead of as a correlated error event. The round trip doubles as the
   * client's only honest RTT sample.
   */
  async request<E extends keyof ClientToServerEvents>(
    event: E,
    payload: PayloadOf<E>,
  ): Promise<AckOf<E>> {
    const socket = this.socket;
    if (socket === null) throw new Error('SocketService.request called before connect()');
    const emitter = socket.timeout(ACK_TIMEOUT_MS) as unknown as {
      emitWithAck: (event: E, payload: PayloadOf<E>) => Promise<AckOf<E>>;
    };
    const started = Date.now();
    try {
      return await emitter.emitWithAck(event, payload);
    } finally {
      this.sampleRtt(Date.now() - started);
    }
  }

  private sampleRtt(sample: number): void {
    // A timed-out ack is not a round trip; folding it in would peg the estimate at the timeout.
    if (sample >= ACK_TIMEOUT_MS) return;
    this._rttMs.update((current) =>
      current === null ? sample : Math.round(current + RTT_SMOOTHING * (sample - current)),
    );
  }

  private bindRegistered(socket: GameSocket): void {
    const target = bridge(socket);
    if (target === null) return;
    for (const [event, set] of this.listeners) {
      for (const handler of set) target.on(event, handler);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

/**
 * socket.io types listeners as a conditional over the *concrete* event name, which a generic `E`
 * cannot satisfy. The public signatures above are exact for callers; the imprecision stops here.
 */
function bridge(socket: GameSocket | null): {
  on(event: string, listener: Listener): void;
  off(event: string, listener: Listener): void;
} | null {
  return socket as unknown as {
    on(event: string, listener: Listener): void;
    off(event: string, listener: Listener): void;
  } | null;
}
