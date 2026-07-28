import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@contracts/protocol';
import type { ProtocolError, SessionHelloPayload } from '@contracts/protocol';

import { APP_CONFIG, buildAppConfig } from '@core/config/app-config';

import { SocketService } from './socket.service';
import { SOCKET_FACTORY } from './socket.types';
import type { GameSocket } from './socket.types';

type Listener = (...args: unknown[]) => void;

/** Just enough socket.io surface to drive the wrapper without a server. */
class FakeSocket {
  readonly listeners = new Map<string, Set<Listener>>();
  connected = false;
  disconnectCalls = 0;

  constructor(
    readonly url: string,
    readonly options: Record<string, unknown>,
  ) {}

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  disconnect(): this {
    this.disconnectCalls += 1;
    this.connected = false;
    return this;
  }

  /** Simulate the server. */
  fire(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

const HELLO: SessionHelloPayload = {
  protocolVersion: PROTOCOL_VERSION,
  serverTime: 1_700_000_000_000,
  userId: null,
};

describe('SocketService', () => {
  let created: FakeSocket[];

  beforeEach(() => {
    created = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_CONFIG,
          useValue: buildAppConfig({
            production: false,
            apiUrl: 'http://api.test',
            socketUrl: 'http://socket.test',
          }),
        },
        {
          provide: SOCKET_FACTORY,
          useValue: (url: string, options: Record<string, unknown>) => {
            const socket = new FakeSocket(url, options);
            created.push(socket);
            return socket as unknown as GameSocket;
          },
        },
      ],
    });
  });

  function connect(): { service: SocketService; socket: FakeSocket } {
    const service = TestBed.inject(SocketService);
    service.connect();
    return { service, socket: created[0]! };
  }

  it('starts idle and connects to the configured endpoint', () => {
    const service = TestBed.inject(SocketService);
    expect(service.status()).toBe('idle');

    service.connect();
    expect(created).toHaveLength(1);
    expect(created[0]!.url).toBe('http://socket.test');
    expect(service.status()).toBe('connecting');
  });

  it('sends the protocol version in the handshake, as the gateway requires', () => {
    const { socket } = connect();
    expect(socket.options['auth']).toEqual({ protocolVersion: PROTOCOL_VERSION });
    expect(socket.options['transports']).toEqual(['websocket']);
  });

  it('includes the access token once one is set', () => {
    const service = TestBed.inject(SocketService);
    service.setAccessToken('jwt-token');
    service.connect();
    expect(created[0]!.options['auth']).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      token: 'jwt-token',
    });
  });

  it('is only truly connected once the server has greeted it', () => {
    const { service, socket } = connect();

    socket.fire('connect');
    expect(service.status()).toBe('connected');
    expect(service.isConnected()).toBe(false);

    socket.fire('session:hello', HELLO);
    expect(service.isConnected()).toBe(true);
    expect(service.hello()).toEqual(HELLO);
  });

  it('measures clock skew from the greeting', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_001_500);
    const { service, socket } = connect();
    socket.fire('session:hello', HELLO);
    expect(service.clockSkewMs()).toBe(-1500);
    vi.restoreAllMocks();
  });

  it('reports reconnecting after an unexpected drop', () => {
    const { service, socket } = connect();
    socket.fire('connect');
    socket.fire('session:hello', HELLO);

    socket.fire('disconnect', 'transport close');
    expect(service.status()).toBe('reconnecting');
    expect(service.hello()).toBeNull();
    expect(service.isConnected()).toBe(false);
  });

  it('counts connect failures and escalates to reconnecting', () => {
    const { service, socket } = connect();

    socket.fire('connect_error', new Error('ECONNREFUSED'));
    expect(service.status()).toBe('disconnected');
    expect(service.lastError()?.message).toBe('ECONNREFUSED');

    socket.fire('connect_error', new Error('ECONNREFUSED'));
    expect(service.status()).toBe('reconnecting');
    expect(service.reconnectAttempts()).toBe(2);
  });

  it('stops trying on a protocol mismatch — a reload is the only fix', () => {
    const { service, socket } = connect();
    const error: ProtocolError = { code: 'PROTOCOL_MISMATCH', message: 'server speaks v2' };

    socket.fire('error', error);

    expect(service.status()).toBe('protocol-mismatch');
    expect(socket.disconnectCalls).toBe(1);

    // Even a subsequent drop must not flip it back to a retryable state.
    socket.fire('disconnect', 'io server disconnect');
    expect(service.status()).toBe('protocol-mismatch');
  });

  it('keeps other protocol errors visible without giving up the socket', () => {
    const { service, socket } = connect();
    socket.fire('error', { code: 'RATE_LIMITED', message: 'slow down' } satisfies ProtocolError);
    expect(service.lastError()?.code).toBe('RATE_LIMITED');
    expect(service.status()).not.toBe('protocol-mismatch');
    expect(socket.disconnectCalls).toBe(0);
  });

  it('unsubscribes listeners on request', () => {
    const { service, socket } = connect();
    const handler = vi.fn();

    const off = service.on('lobby:matched', handler);
    socket.fire('lobby:matched', { tableId: 'abc' });
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    socket.fire('lobby:matched', { tableId: 'abc' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('refuses to emit or subscribe before connecting', () => {
    const service = TestBed.inject(SocketService);
    expect(() => service.on('lobby:matched', vi.fn())).toThrow(/before connect/);
    return expect(service.request('lobby:cancel', { ticketId: 't1' })).rejects.toThrow(
      /before connect/,
    );
  });

  it('drops and rebuilds the socket on an explicit retry', () => {
    const { service, socket } = connect();
    socket.fire('connect_error', new Error('nope'));

    service.reconnect();

    expect(socket.disconnectCalls).toBe(1);
    expect(created).toHaveLength(2);
    expect(service.reconnectAttempts()).toBe(0);
  });
});
