import { InjectionToken } from '@angular/core';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents } from '@contracts/protocol';

/** The client's view of a socket.io socket, typed by the contract's event maps. */
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Connection states, surfaced explicitly and never silently
 * (`docs/07-frontend.md` §6). `resyncing` belongs to the game store and arrives with M4.
 */
export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'protocol-mismatch';

export type SocketFactory = (url: string, options: Record<string, unknown>) => GameSocket;

/** Indirection so tests can drive the wrapper without a server. */
export const SOCKET_FACTORY = new InjectionToken<SocketFactory>('SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url, options) => io(url, options) as GameSocket,
});

/** Payload type of a client→server event. */
export type PayloadOf<E extends keyof ClientToServerEvents> = Parameters<
  ClientToServerEvents[E]
>[0];

/** Acknowledgement type of a client→server event. */
export type AckOf<E extends keyof ClientToServerEvents> = Parameters<
  Parameters<ClientToServerEvents[E]>[1]
>[0];
