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

/**
 * Typed socket.io wrapper.
 *
 * Everything that talks to the server goes through here, so there is exactly one place that knows
 * the handshake, the reconnect policy and the connection state. State is signals — the app has no
 * client-side business logic to justify a reducer stack (`docs/07-frontend.md` §1).
 *
 * M0 covers the handshake. Table routing, the event queue, prompts and resync land in M4; the
 * `emit`/`request`/`on` surface below is what they build on.
 */
@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private readonly config = inject(APP_CONFIG);
  private readonly createSocket = inject(SOCKET_FACTORY);

  private socket: GameSocket | null = null;
  private accessToken: string | null = null;

  private readonly _status = signal<ConnectionStatus>('idle');
  private readonly _hello = signal<SessionHelloPayload | null>(null);
  private readonly _lastError = signal<ProtocolError | null>(null);
  private readonly _attempts = signal(0);

  readonly status = this._status.asReadonly();
  /** The server's greeting; `null` until the handshake completes. */
  readonly hello = this._hello.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  readonly reconnectAttempts = this._attempts.asReadonly();

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

  /** Set before {@link connect}; M3 issues real tokens. */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  connect(): void {
    if (this.socket !== null) return;

    this._status.set('connecting');
    this._lastError.set(null);

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
    this.connect();
  }

  /** Subscribe to a server event. Returns an unsubscribe function. */
  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): () => void {
    const socket = this.socket;
    if (socket === null) throw new Error('SocketService.on called before connect()');

    // socket.io types listeners as a conditional over the *concrete* event name, which a generic
    // `E` cannot satisfy. The signature above is exact for callers; the imprecision stops here.
    const bridge = socket as unknown as {
      on(event: string, listener: (...args: never[]) => void): void;
      off(event: string, listener: (...args: never[]) => void): void;
    };
    const handler = listener as (...args: never[]) => void;

    bridge.on(event, handler);
    return () => {
      bridge.off(event, handler);
    };
  }

  /**
   * Send an event and wait for its acknowledgement. Every client→server event acknowledges, so
   * failures come back typed instead of as a correlated error event.
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
    return emitter.emitWithAck(event, payload);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
