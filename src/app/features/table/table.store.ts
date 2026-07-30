import { Injectable, computed, inject, signal } from '@angular/core';

import type { GameLength, Seat } from '@contracts/actions';
import type { Ack, ClientToServerEvents } from '@contracts/protocol';
import type { SeatConfig, TableState } from '@contracts/views';

import { AuthService } from '@core/auth/auth.service';
import { SocketService } from '@core/socket/socket.service';
import type { AckOf, PayloadOf } from '@core/socket/socket.types';

export interface CreateTableRequest {
  length: GameLength;
  seats: [SeatConfig, SeatConfig, SeatConfig, SeatConfig];
  private: boolean;
}

/**
 * The pre-game table: who is sitting where, who is ready, and the countdown.
 *
 * `table:state` is the authority and arrives on every change; `table:playerJoined` / `Left` are
 * announcements, not state, and are kept only so the screen can say *"Kaori sat down"* without
 * diffing two snapshots to work out that it happened.
 */
@Injectable({ providedIn: 'root' })
export class TableStore {
  private readonly socket = inject(SocketService);
  private readonly auth = inject(AuthService);

  private readonly _state = signal<TableState | null>(null);
  private readonly _countdown = signal<number | null>(null);
  private readonly _notice = signal<string | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly countdown = this._countdown.asReadonly();
  readonly notice = this._notice.asReadonly();
  readonly error = this._error.asReadonly();

  readonly tableId = computed(() => this._state()?.tableId ?? null);
  readonly status = computed(() => this._state()?.status ?? null);
  readonly seats = computed(() => this._state()?.seats ?? []);
  readonly inviteCode = computed(() => this._state()?.inviteCode ?? null);

  readonly isHost = computed(() => {
    const state = this._state();
    const userId = this.auth.user()?.id ?? null;
    return state !== null && userId !== null && state.hostUserId === userId;
  });

  readonly mySeat = computed<Seat | null>(() => {
    const userId = this.auth.user()?.id ?? null;
    if (userId === null) return null;
    return this._state()?.seats.find((seat) => seat.player?.userId === userId)?.seat ?? null;
  });

  readonly amReady = computed(() => {
    const seat = this.mySeat();
    if (seat === null) return false;
    return this._state()?.seats.find((entry) => entry.seat === seat)?.ready ?? false;
  });

  constructor() {
    this.socket.on('table:state', (state) => {
      this._state.set(state);
      if (state.status !== 'starting') this._countdown.set(null);
    });
    this.socket.on('table:countdown', (payload) => {
      this._countdown.set(payload.secondsRemaining);
    });
    this.socket.on('table:playerJoined', (payload) => {
      this._notice.set(`${payload.player.displayName} sat down`);
    });
    this.socket.on('table:playerLeft', (payload) => {
      this._notice.set(`${payload.player.displayName} left`);
    });
  }

  clearNotice(): void {
    this._notice.set(null);
  }

  clear(): void {
    this._state.set(null);
    this._countdown.set(null);
    this._notice.set(null);
    this._error.set(null);
  }

  async create(request: CreateTableRequest): Promise<string | null> {
    const ack = await this.call('table:create', request);
    if (ack === null || !ack.ok) return null;
    return ack.tableId;
  }

  async join(target: { tableId?: string; inviteCode?: string }): Promise<string | null> {
    const ack = await this.call('table:join', target);
    if (ack === null || !ack.ok) return null;
    return ack.tableId;
  }

  async leave(tableId: string): Promise<void> {
    await this.call('table:leave', { tableId });
    this.clear();
  }

  async setSeat(seat: Seat, config: SeatConfig): Promise<void> {
    const tableId = this.tableId();
    if (tableId === null) return;
    await this.call('table:setSeat', {
      tableId,
      seat,
      fill: config.fill,
      ...(config.botLevel === undefined ? {} : { botLevel: config.botLevel }),
    });
  }

  async setReady(ready: boolean): Promise<void> {
    const tableId = this.tableId();
    if (tableId === null) return;
    await this.call('table:ready', { tableId, ready });
  }

  async start(): Promise<void> {
    const tableId = this.tableId();
    if (tableId === null) return;
    await this.call('table:start', { tableId });
  }

  /** One error surface: every table action reports through `error()` and returns the raw ack. */
  private async call<E extends keyof ClientToServerEvents>(
    event: E,
    payload: PayloadOf<E>,
  ): Promise<AckOf<E> | null> {
    this._error.set(null);
    try {
      const ack = await this.socket.request(event, payload);
      const result = ack as unknown as Ack;
      if (!result.ok) this._error.set(result.error.message);
      return ack;
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : 'the server did not answer');
      return null;
    }
  }
}
