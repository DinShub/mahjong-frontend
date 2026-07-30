import { Injectable, computed, inject, signal } from '@angular/core';

import type {
  AgariEvent,
  ClientAction,
  GameEvent,
  Placement,
  PlayerInfo,
  RyuukyokuEvent,
  Seat,
} from '@contracts/actions';
import { RATE_LIMITS } from '@contracts/protocol';
import type { Ack, RatingChange } from '@contracts/protocol';
import type { TileStr } from '@contracts/tiles';
import type { PlayerView, Prompt } from '@contracts/views';

import { SettingsService } from '@core/settings/settings.service';
import { SocketService } from '@core/socket/socket.service';
import { SCHEDULER } from '@core/time/scheduler';

import { applyEvent } from './apply-event';
import { EventQueue } from './event-queue';
import { seatToPos } from './seat-position';
import type { SeatPos } from './seat-position';

/** The persistent "auto-buttons" of `docs/07-frontend.md` §3. Cleared at every hand end. */
export interface PreSelection {
  autoPass: boolean;
  autoWin: boolean;
  autoTsumogiri: boolean;
}

const NO_PRESELECTION: PreSelection = { autoPass: false, autoWin: false, autoTsumogiri: false };

/** What the results screen needs, merged from the two events that carry pieces of it. */
export interface GameEndSummary {
  placements: readonly Placement[];
  seed: string;
  seedHash?: string;
  ratingChanges?: readonly RatingChange[];
}

const RESYNC_COOLDOWN_MS = RATE_LIMITS.gameResync.perSeconds * 1000;

/** How long to wait for the snapshot the server sends on join before asking for one. */
const ATTACH_SNAPSHOT_GRACE_MS = 400;

/**
 * The game's state, and the only thing that writes it.
 *
 * `docs/07-frontend.md` §1: **the store never derives game rules.** It does not compute what is
 * legal, what a hand is worth, or whether a wait exists. What it does own is the three things a
 * server cannot: the order events are *shown* in ({@link EventQueue}), which absolute seat is
 * drawn where ({@link seatToPos}), and what to do when the two disagree — a `seq` gap, which is
 * always answered by throwing local state away and asking for a snapshot.
 */
@Injectable({ providedIn: 'root' })
export class GameStore {
  private readonly socket = inject(SocketService);
  private readonly settings = inject(SettingsService);
  private readonly scheduler = inject(SCHEDULER);

  private readonly _view = signal<PlayerView | null>(null);
  private readonly _prompt = signal<Prompt | null>(null);
  private readonly _tableId = signal<string | null>(null);
  private readonly _resyncing = signal(false);
  private readonly _lastAgari = signal<AgariEvent | null>(null);
  private readonly _lastRyuukyoku = signal<RyuukyokuEvent | null>(null);
  private readonly _gameEnd = signal<GameEndSummary | null>(null);
  private readonly _uraIndicators = signal<readonly TileStr[]>([]);
  private readonly _preSelection = signal<PreSelection>(NO_PRESELECTION);
  private readonly _actionError = signal<string | null>(null);
  private readonly _botTakeover = signal<Seat[]>([]);
  private readonly _handTransition = signal(false);
  private readonly _lastEvent = signal<GameEvent | null>(null);
  private readonly _scoreDeltas = signal<readonly (number | null)[]>([]);

  private lastSeq: number | null = null;
  /** `-Infinity`, not `0`: the cooldown must never delay the *first* resync of a session. */
  private lastResyncAt = Number.NEGATIVE_INFINITY;
  private teardown: (() => void)[] = [];

  readonly queue = new EventQueue({
    apply: (event, seq) => {
      this.commit(event, seq);
    },
    scheduler: this.scheduler,
    reducedMotion: () => this.settings.reducedMotion(),
  });

  // -------------------------------------------------------------------------
  // Selectors
  // -------------------------------------------------------------------------

  readonly view = this._view.asReadonly();
  readonly tableId = this._tableId.asReadonly();
  readonly resyncing = this._resyncing.asReadonly();
  readonly prompt = this._prompt.asReadonly();
  readonly lastAgari = this._lastAgari.asReadonly();
  readonly lastRyuukyoku = this._lastRyuukyoku.asReadonly();
  readonly gameEnd = this._gameEnd.asReadonly();
  /**
   * The final standings, withheld until the hand that produced them has been seen and dismissed.
   *
   * `game:ended` arrives on the socket, *outside* the queue, so it lands the moment the server has
   * finished writing the game — while the winning hand is still queued behind its dwell, or sitting
   * on screen waiting to be read. Rendered on that signal alone the scoreboard covers the agari
   * that explains it, and the last hand of a game is the one hand nobody wants to miss.
   *
   * Both conditions are needed. `pending` covers the hand that has not been shown yet; the two
   * result signals cover the one that has been shown and not yet dismissed. Neither implies the
   * other, and a reconnect into an already-finished game satisfies both immediately, which is
   * right: there is no hand left to watch.
   */
  readonly finalStandings = computed(() => {
    if (this.queue.pending() > 0) return null;
    if (this._lastAgari() !== null || this._lastRyuukyoku() !== null) return null;
    return this._gameEnd();
  });
  readonly uraIndicators = this._uraIndicators.asReadonly();
  readonly preSelection = this._preSelection.asReadonly();
  readonly actionError = this._actionError.asReadonly();
  readonly botTakeover = this._botTakeover.asReadonly();
  readonly handTransition = this._handTransition.asReadonly();
  /** The most recent event to reach the view — what the live region announces. */
  readonly lastEvent = this._lastEvent.asReadonly();
  /**
   * Per absolute seat, while a result is on screen. `null` where a seat neither paid nor was paid —
   * a `±0` next to three real numbers reads as a rounding error rather than as "not involved".
   */
  readonly scoreDeltas = this._scoreDeltas.asReadonly();
  readonly holding = this.queue.holding;

  readonly mySeat = computed<Seat | null>(() => this._view()?.mySeat ?? null);
  readonly isSpectator = computed(() => this.mySeat() === null);
  readonly phase = computed(() => this._view()?.phase ?? 'waiting');
  readonly scores = computed<readonly number[]>(() => this._view()?.scores ?? [0, 0, 0, 0]);
  readonly players = computed<readonly PlayerInfo[]>(
    () => this._view()?.players.map((seat) => seat.player) ?? [],
  );
  readonly doraIndicators = computed<readonly TileStr[]>(() => this._view()?.doraIndicators ?? []);
  readonly wallRemaining = computed(() => this._view()?.wallRemaining ?? 0);
  readonly turn = computed<Seat | null>(() => this._view()?.turn ?? null);

  readonly me = computed(() => {
    const view = this._view();
    const seat = view?.mySeat;
    if (view === undefined || view === null || seat === null || seat === undefined) return null;
    return view.players.find((player) => player.seat === seat) ?? null;
  });

  readonly myHand = computed<readonly TileStr[]>(() => this.me()?.hand ?? []);
  readonly myDrawn = computed<TileStr | null>(() => this.me()?.drawn ?? null);

  /** Can this tab act? A demoted tab renders everything and submits nothing. */
  readonly canAct = computed(
    () => this._prompt() !== null && !this.socket.demoted() && !this.isSpectator(),
  );

  /** Absolute seat → screen position, for the render layer. */
  readonly seatToPos = computed<(seat: Seat) => SeatPos>(() => {
    const mine = this.mySeat();
    return (seat: Seat) => seatToPos(seat, mine);
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start tracking a table. Idempotent for the same id; switching tables resets everything. */
  attach(tableId: string): void {
    if (this._tableId() === tableId && this.teardown.length > 0) return;
    this.detach();
    this._tableId.set(tableId);
    this.subscribe();

    // The server volunteers a snapshot when a socket joins a table, which may be *before* this
    // screen exists — the table screen routes here on `table:state`, and a hard refresh into
    // `/game/:id` races the handshake. Either way the snapshot lands on nobody and the board
    // waits forever. So: if none has arrived shortly, ask. In the ordinary case it already has
    // and this costs nothing.
    this.scheduler.schedule(() => {
      if (this._view() === null && this._tableId() === tableId) this.requestResync();
    }, ATTACH_SNAPSHOT_GRACE_MS);
  }

  detach(): void {
    for (const off of this.teardown) off();
    this.teardown = [];
    this.queue.clear();
    this._view.set(null);
    this._prompt.set(null);
    this._tableId.set(null);
    this._resyncing.set(false);
    this._lastAgari.set(null);
    this._lastRyuukyoku.set(null);
    this._gameEnd.set(null);
    this._uraIndicators.set([]);
    this._preSelection.set(NO_PRESELECTION);
    this._actionError.set(null);
    this._botTakeover.set([]);
    this._scoreDeltas.set([]);
    this.lastSeq = null;
  }

  private subscribe(): void {
    this.teardown.push(
      this.socket.on('game:snapshot', (payload) => {
        if (payload.view.tableId !== this._tableId()) return;
        // Snapshot-over-merge, always (`docs/05-realtime-protocol.md` §6).
        this.queue.clear();
        this.lastSeq = payload.seq;
        this._view.set(payload.view);
        this._prompt.set(payload.view.pendingPrompt);
        this._resyncing.set(false);
      }),

      this.socket.on('game:event', (payload) => {
        this.ingest(payload.seq, payload.payload);
      }),

      this.socket.on('game:prompt', (prompt) => {
        // The options describe the state as the server has it. Anything still queued happened
        // before this question was asked, so it is applied now rather than paced out behind it —
        // otherwise the hand on screen and the tiles being offered are from different turns.
        this.queue.catchUpToPrompt();
        this._prompt.set(prompt);
        this._actionError.set(null);
        this.tryPreSelection(prompt);
      }),

      this.socket.on('game:promptCancelled', (payload) => {
        if (this._prompt()?.promptId === payload.promptId) this._prompt.set(null);
      }),

      this.socket.on('game:ended', (payload) => {
        // The lobby-level event and the engine's own `game-end` both carry placements and the
        // seed; only this one carries rating changes, so it wins where they overlap.
        this._gameEnd.set({
          placements: payload.placements,
          seed: payload.seed,
          seedHash: payload.seedHash,
          ...(payload.ratingChanges === undefined ? {} : { ratingChanges: payload.ratingChanges }),
        });
      }),

      this.socket.on('player:disconnected', (payload) => {
        this.setConnection(payload.seat, 'disconnected');
      }),

      this.socket.on('player:reconnected', (payload) => {
        this.setConnection(payload.seat, 'online');
        this._botTakeover.update((seats) => seats.filter((seat) => seat !== payload.seat));
      }),

      this.socket.on('player:afk', (payload) => {
        if (!payload.takenOverByBot) return;
        this.setConnection(payload.seat, 'bot');
        this._botTakeover.update((seats) =>
          seats.includes(payload.seat) ? seats : [...seats, payload.seat],
        );
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Sequencing
  // -------------------------------------------------------------------------

  /**
   * `seq` is per-table and starts at 1. Three cases, and the third is the only interesting one:
   * a duplicate is dropped, the next one is queued, and a *gap* means this client has missed
   * something it can never reconstruct — so it stops guessing and asks for a snapshot.
   */
  private ingest(seq: number, event: GameEvent): void {
    if (this.lastSeq !== null) {
      if (seq <= this.lastSeq) return;
      if (seq > this.lastSeq + 1) {
        this.requestResync();
        return;
      }
    }
    this.lastSeq = seq;
    this.queue.push(event, seq);
  }

  requestResync(): void {
    const tableId = this._tableId();
    if (tableId === null) return;

    const now = this.scheduler.now();
    // The server allows one resync every two seconds; a client that asks faster is rate-limited
    // off the socket, which is a worse outcome than waiting.
    if (now - this.lastResyncAt < RESYNC_COOLDOWN_MS) return;
    this.lastResyncAt = now;

    this._resyncing.set(true);
    this.queue.clear();
    this.lastSeq = null;
    void this.socket
      .request('game:resync', { tableId })
      .catch(() => this._resyncing.set(false))
      .then(() => undefined);
  }

  /** The one place an event reaches the view. */
  private commit(event: GameEvent, seq: number): void {
    const tableId = this._tableId() ?? '';
    const next = applyEvent(this._view(), event, { tableId, mySeat: this.mySeat() });
    if (next !== null) this._view.set({ ...next, seq, lastEventSeq: seq });
    this._lastEvent.set(event);

    switch (event.t) {
      case 'hand-start':
        this._lastAgari.set(null);
        this._lastRyuukyoku.set(null);
        this._scoreDeltas.set([]);
        this._uraIndicators.set([]);
        this._handTransition.set(true);
        this.scheduler.schedule(() => this._handTransition.set(false), 400);
        break;
      case 'agari':
        this._lastAgari.set(event);
        this._scoreDeltas.set(showable(event.scoreDeltas));
        this._uraIndicators.set(event.uraIndicators ?? []);
        this.clearPreSelection();
        break;
      case 'ryuukyoku':
        this._lastRyuukyoku.set(event);
        this._scoreDeltas.set(showable(event.scoreDeltas));
        this.clearPreSelection();
        break;
      case 'hand-end':
        this.clearPreSelection();
        break;
      case 'game-end':
        this._gameEnd.update(
          (current) => current ?? { placements: event.placements, seed: event.seed },
        );
        this.clearPreSelection();
        break;
      default:
        break;
    }
  }

  private setConnection(seat: Seat, connection: 'online' | 'disconnected' | 'bot'): void {
    this._view.update((view) =>
      view === null
        ? view
        : {
            ...view,
            players: view.players.map((player) =>
              player.seat === seat ? { ...player, connection } : player,
            ),
          },
    );
  }

  // -------------------------------------------------------------------------
  // Acting
  // -------------------------------------------------------------------------

  /**
   * Answer the outstanding prompt.
   *
   * The `promptId` is mandatory and is what makes a double-click or a late click harmless: the
   * server rejects a stale one with `STALE_PROMPT` rather than applying it to a state it no longer
   * describes (`docs/05-realtime-protocol.md` §5).
   */
  async submit(action: ClientAction): Promise<Ack | null> {
    const prompt = this._prompt();
    const tableId = this._tableId();
    if (prompt === null || tableId === null || !this.canAct()) return null;

    // Clear optimistically: the button set belongs to a decision that has now been made, and a
    // second click on a still-rendered bar is the exact double-submit `promptId` exists to stop.
    this._prompt.set(null);

    const ack = (await this.socket
      .request('game:action', { tableId, promptId: prompt.promptId, action })
      .catch(() => ({ ok: false, error: { code: 'INTERNAL', message: 'no response' } }) as Ack)) as
      Ack | undefined;

    if (ack !== undefined && !ack.ok) {
      if (ack.error.code === 'STALE_PROMPT') {
        // Expected: the window closed under us. The server's own prompt lifecycle is the truth.
        this._actionError.set(null);
      } else {
        this._actionError.set(ack.error.message);
        // Something we believed about the game was wrong; a snapshot is the cheapest repair.
        if (ack.error.code === 'ILLEGAL_ACTION' || ack.error.code === 'NOT_YOUR_TURN') {
          this.requestResync();
        }
      }
    }
    return ack ?? null;
  }

  /**
   * "Continue" on a result.
   *
   * Two things, and both are needed: release the queue's hold so the game moves on, and put the
   * result away. The overlay is driven by the last result rather than by the hold, because a hold
   * that expires on its own after eight seconds is followed by a `hand-start` that clears it —
   * but the last hand of a game has nothing after it, and an overlay with a dismiss button that
   * does not dismiss is worse than no button.
   */
  dismissOverlay(): void {
    this.queue.dismiss();
    this._lastAgari.set(null);
    this._lastRyuukyoku.set(null);
  }

  // -------------------------------------------------------------------------
  // Pre-selection
  // -------------------------------------------------------------------------

  togglePreSelection(key: keyof PreSelection): void {
    this._preSelection.update((current) => ({ ...current, [key]: !current[key] }));
    const prompt = this._prompt();
    if (prompt !== null) this.tryPreSelection(prompt);
  }

  clearPreSelection(): void {
    this._preSelection.set(NO_PRESELECTION);
  }

  /**
   * Fire an armed auto-button the instant a matching prompt arrives.
   *
   * Order matters and is not negotiable: a win is never skipped by an auto-pass, and
   * auto-tsumogiri stands down for anything the player would want to see — a win, or the
   * nine-terminals abort, both of which are decisions and not turns.
   */
  private tryPreSelection(prompt: Prompt): void {
    const armed = this._preSelection();
    const options = prompt.options;
    const has = (type: ClientAction['type']): boolean =>
      options.some((option) => option.type === type);

    if (armed.autoWin) {
      const win = options.find((option) => option.type === 'tsumo' || option.type === 'ron');
      if (win !== undefined) {
        void this.submit(win as ClientAction);
        return;
      }
    }
    if (armed.autoPass && has('pass') && !has('tsumo') && !has('ron')) {
      void this.submit({ type: 'pass' });
      return;
    }
    if (armed.autoTsumogiri && !has('tsumo') && !has('ron') && !has('kyuushu')) {
      const drawn = this.myDrawn();
      const tsumogiri = options.find(
        (option) => option.type === 'discard' && option.tile === drawn && option.riichi !== true,
      );
      if (tsumogiri !== undefined) void this.submit(tsumogiri as ClientAction);
    }
  }
}

function showable(deltas: readonly number[]): (number | null)[] {
  return deltas.map((delta) => (delta === 0 ? null : delta));
}
