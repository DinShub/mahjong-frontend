import { Injectable, computed, inject, signal } from '@angular/core';

import type { GameLength } from '@contracts/actions';
import type { LobbyCancelledPayload, LobbyQueueStatusPayload } from '@contracts/protocol';

import { SocketService } from '@core/socket/socket.service';

/**
 * Quickmatch: a ticket, a position, and a deadline by which a table certainly exists.
 *
 * The ETA is the server's, not a guess — M3 measures it from the head of the queue's bot-fill
 * deadline, so *"about 14 seconds"* is a promise the server can keep by seating bots, rather than
 * a prediction about who else might arrive.
 */
@Injectable({ providedIn: 'root' })
export class LobbyStore {
  private readonly socket = inject(SocketService);

  private readonly _ticketId = signal<string | null>(null);
  private readonly _status = signal<LobbyQueueStatusPayload | null>(null);
  private readonly _matchedTableId = signal<string | null>(null);
  private readonly _cancelled = signal<LobbyCancelledPayload | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly ticketId = this._ticketId.asReadonly();
  readonly queueStatus = this._status.asReadonly();
  readonly matchedTableId = this._matchedTableId.asReadonly();
  readonly cancelled = this._cancelled.asReadonly();
  readonly error = this._error.asReadonly();

  readonly isQueued = computed(() => this._ticketId() !== null);

  constructor() {
    this.socket.on('lobby:queueStatus', (status) => {
      this._status.set(status);
    });
    this.socket.on('lobby:matched', (payload) => {
      this._ticketId.set(null);
      this._status.set(null);
      this._matchedTableId.set(payload.tableId);
    });
    this.socket.on('lobby:cancelled', (payload) => {
      if (payload.ticketId !== this._ticketId()) return;
      this._ticketId.set(null);
      this._status.set(null);
      this._cancelled.set(payload);
    });
  }

  consumeMatch(): void {
    this._matchedTableId.set(null);
  }

  clearCancellation(): void {
    this._cancelled.set(null);
  }

  async quickmatch(length: GameLength): Promise<boolean> {
    this._error.set(null);
    this._cancelled.set(null);
    try {
      const ack = await this.socket.request('lobby:quickmatch', { length });
      if (!ack.ok) {
        this._error.set(ack.error.message);
        return false;
      }
      this._ticketId.set(ack.ticketId);
      return true;
    } catch {
      this._error.set('the server did not answer');
      return false;
    }
  }

  async cancel(): Promise<void> {
    const ticketId = this._ticketId();
    // Optimistic: the goal is "not queued", and the client is not, whatever the ack says.
    this._ticketId.set(null);
    this._status.set(null);
    if (ticketId === null) return;
    try {
      await this.socket.request('lobby:cancel', { ticketId });
    } catch {
      // Nothing to repair — a cancel the server never heard expires on its own.
    }
  }
}
