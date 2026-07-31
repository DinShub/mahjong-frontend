import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

import type { ClientAction } from '@contracts/actions';
import { compareTileStr } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';

import { ViewportService } from '@core/layout/viewport.service';
import { SettingsService } from '@core/settings/settings.service';
import { SocketService } from '@core/socket/socket.service';
import { SoundService } from '@core/sound/sound.service';

import { TileSpriteService } from '@shared/tiles/tile-sprite.service';

import { TableStore } from '../table/table.store';
import { playGameSounds } from './game-sound';
import { ActionBarComponent } from './input/action-bar.component';
import { discardTiles, riichiTiles } from './input/action-slots';
import { PreSelectionComponent } from './input/pre-selection.component';
import { PromptClock } from './input/prompt-clock';
import { AgariOverlayComponent } from './overlays/agari-overlay.component';
import { ConnectionOverlayComponent } from './overlays/connection-overlay.component';
import { GameEndOverlayComponent } from './overlays/game-end-overlay.component';
import { HandTransitionComponent } from './overlays/hand-transition.component';
import { LeaveGameComponent } from './overlays/leave-game.component';
import { LiveRegionComponent } from './overlays/live-region.component';
import { RyuukyokuOverlayComponent } from './overlays/ryuukyoku-overlay.component';
import { ACTION_BOX, boxStyle } from './render/board-layout';
import { BoardPortraitComponent } from './render/board-portrait.component';
import { BoardComponent } from './render/board.component';
import type { HandTile } from './render/hand.component';
import { StageComponent } from './render/stage.component';
import { GameStore } from './state/game.store';
import type { PreSelection } from './state/game.store';

/**
 * The game screen: store in, board and buttons out.
 *
 * All the *policy* of input lives here rather than in the render components — one click or two,
 * what riichi mode allows, what a key does — because it is the part that has to agree with itself
 * across four different ways of doing the same thing (click, drag, keyboard, auto-button), and
 * because every one of them funnels into the same `submit()` with the same `promptId`.
 */
@Component({
  selector: 'mj-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionBarComponent,
    AgariOverlayComponent,
    BoardComponent,
    BoardPortraitComponent,
    ConnectionOverlayComponent,
    GameEndOverlayComponent,
    HandTransitionComponent,
    LeaveGameComponent,
    LiveRegionComponent,
    PreSelectionComponent,
    RyuukyokuOverlayComponent,
    StageComponent,
  ],
  host: {
    class: 'mj-game',
    '(window:keydown)': 'onKey($event)',
    '[attr.data-testid]': '"game"',
  },
  template: `
    <mj-stage>
      @if (view(); as current) {
        @if (viewport.isPortrait()) {
          <mj-board-portrait
            [view]="current"
            [interactive]="store.canAct()"
            [selectableTiles]="selectableTiles()"
            [selectedSlot]="selectedSlot()"
            [deadlineProgress]="clock.progress()"
            [uraIndicators]="store.uraIndicators()"
            [scoreDeltas]="store.scoreDeltas()"
            (pick)="onPick($event)"
            (dragDiscard)="onDragDiscard($event)"
          />
        } @else {
          <mj-board
            [view]="current"
            [interactive]="store.canAct()"
            [selectableTiles]="selectableTiles()"
            [selectedSlot]="selectedSlot()"
            [deadlineProgress]="clock.progress()"
            [uraIndicators]="store.uraIndicators()"
            [scoreDeltas]="store.scoreDeltas()"
            (pick)="onPick($event)"
            (dragDiscard)="onDragDiscard($event)"
          />
        }

        <!--
          The action bar comes before the auto-buttons in the DOM and is put back below them with
          CSS order. docs/07-frontend.md §7 fixes the focus order as hand left-to-right, then the
          action buttons — the toggles are a setting, not a move, and tabbing through three of them
          to reach Ron inside a five-second window is not a keyboard-playable game.
        -->
        <div class="controls" [style]="viewport.isPortrait() ? null : actionStyle">
          <mj-action-bar
            [prompt]="store.prompt()"
            [riichiMode]="riichiMode()"
            (choose)="onAction($event)"
            (toggleRiichiMode)="riichiMode.set($event)"
          />
          <div class="clock-row">
            @if (clock.remainingSeconds(); as seconds) {
              <span class="clock" [class.urgent]="clock.urgent()" data-testid="deadline">
                {{ seconds }}s
              </span>
            }
            <mj-pre-selection [state]="store.preSelection()" (armToggled)="onToggle($event)" />
          </div>
        </div>

        @if (store.handTransition()) {
          <mj-hand-transition
            [round]="current.round"
            [kyoku]="current.kyoku"
            [honba]="current.honba"
          />
        }

        @if (store.lastAgari(); as agari) {
          <mj-agari-overlay
            [event]="agari"
            [players]="store.players()"
            (dismiss)="store.dismissOverlay()"
          />
        } @else {
          @if (store.lastRyuukyoku(); as draw) {
            <mj-ryuukyoku-overlay
              [event]="draw"
              [players]="store.players()"
              (dismiss)="store.dismissOverlay()"
            />
          }
        }

        @if (store.finalStandings(); as ended) {
          <mj-game-end-overlay
            [placements]="ended.placements"
            [players]="store.players()"
            [config]="current.config"
            [seed]="ended.seed"
            (leave)="toLobby()"
          />
        }
      } @else {
        <div class="waiting" data-testid="game-waiting">
          <span class="spinner" aria-hidden="true"></span>
          <p>Joining the table…</p>
        </div>
      }

      <mj-connection-overlay
        [status]="socket.status()"
        [resyncing]="store.resyncing()"
        [demoted]="socket.demoted()"
        [botTakeover]="takenOverByBot()"
        (reload)="reload()"
        (reclaim)="reclaim()"
      />

      @if (view() !== null && store.isSpectator()) {
        <p class="watching" role="status" data-testid="spectating">
          Watching — you have no seat at this table
        </p>
      }

      <mj-leave-game
        [seated]="!store.isSpectator()"
        [confirming]="leaving()"
        (open)="leaving.set(true)"
        (dismiss)="leaving.set(false)"
        (confirm)="leaveGame()"
      />

      <mj-live-region
        [event]="store.lastEvent()"
        [players]="store.players()"
        [mySeat]="store.mySeat()"
      />
    </mj-stage>

    @if (store.actionError(); as error) {
      <p class="error" role="alert" data-testid="action-error">{{ error }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .controls {
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-end;
      justify-content: flex-end;
    }

    /* Visual order: clock and auto-buttons above the action bar. Focus order: the other way. */
    .controls .clock-row {
      order: -1;
    }

    /* Portrait puts the controls in the flow at the bottom rather than at a stage coordinate. */
    :host-context(.portrait) .controls {
      position: static;
    }

    .clock-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .clock {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      font-size: 15px;
      min-width: 44px;
      text-align: right;
    }

    .clock.urgent {
      color: var(--mj-danger);
    }

    /* A board you cannot act on looks identical to one that has stopped responding. Say which. */
    .watching {
      position: absolute;
      inset-block-start: 10px;
      inset-inline-start: 50%;
      translate: -50% 0;
      margin: 0;
      padding: 4px 14px;
      border-radius: 999px;
      background: var(--mj-surface-raised);
      border: 1px solid var(--mj-line);
      font-size: 13px;
      font-weight: 600;
    }

    .waiting {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 10px;
      color: var(--mj-text-muted);
    }

    .spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid currentcolor;
      border-block-start-color: transparent;
      animation: spin 0.9s linear infinite;
    }

    @keyframes spin {
      to {
        rotate: 360deg;
      }
    }

    .error {
      position: fixed;
      inset-block-end: 12px;
      inset-inline-start: 50%;
      translate: -50% 0;
      margin: 0;
      padding: 8px 16px;
      border-radius: 8px;
      background: var(--mj-danger);
      color: #2b0d0d;
      font-weight: 600;
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }
  `,
})
export class GameComponent implements OnDestroy {
  protected readonly store = inject(GameStore);
  protected readonly socket = inject(SocketService);
  protected readonly clock = inject(PromptClock);
  protected readonly viewport = inject(ViewportService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly sprite = inject(TileSpriteService);
  private readonly sound = inject(SoundService);
  private readonly table = inject(TableStore);

  /** Bound from the route (`withComponentInputBinding`). */
  readonly tableId = input<string>('');

  protected readonly actionStyle = boxStyle(ACTION_BOX);
  protected readonly riichiMode = signal(false);
  protected readonly selectedSlot = signal<number | null>(null);
  /** Held here, not in the dialog: while it is open the board's keys have to stand down. */
  protected readonly leaving = signal(false);

  protected readonly view = this.store.view;

  /** The tiles the hand may offer, straight from the prompt — never computed here. */
  protected readonly selectableTiles = computed<readonly TileStr[] | null>(() => {
    const prompt = this.store.prompt();
    if (prompt === null || !this.store.canAct()) return [];
    return this.riichiMode() ? riichiTiles(prompt) : discardTiles(prompt);
  });

  protected readonly takenOverByBot = computed(() => {
    const mine = this.store.mySeat();
    return mine !== null && this.store.botTakeover().includes(mine);
  });

  constructor() {
    this.sprite.install();
    this.viewport.measure();
    playGameSounds();

    effect(() => {
      const id = this.tableId();
      if (id.length > 0) this.store.attach(id);
    });

    // A new prompt is a new decision: anything half-chosen for the previous one is stale.
    effect(() => {
      this.store.prompt();
      this.selectedSlot.set(null);
      this.riichiMode.set(false);
    });
  }

  ngOnDestroy(): void {
    this.store.detach();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  /**
   * Click a tile.
   *
   * Two clicks by default — select, then confirm — because the number of misclicked discards with
   * one is unacceptable (`docs/07-frontend.md` §3). Experienced players turn on `one-click` and
   * the first click discards.
   */
  /**
   * Create the `AudioContext` on the first interaction of the session.
   *
   * Browsers refuse to start one outside a user gesture, so this cannot happen at boot. Every
   * input path funnels through here, and `unlock()` is idempotent and cheap after the first call.
   */
  private unlockAudio(): void {
    this.sound.unlock();
  }

  protected onPick(entry: HandTile): void {
    this.unlockAudio();
    if (!this.store.canAct() || entry.tile === null || !entry.selectable) return;
    if (this.settings.discardMode() === 'one-click' || this.selectedSlot() === entry.slot) {
      this.discard(entry.tile);
      return;
    }
    this.selectedSlot.set(entry.slot);
  }

  /** Drag up: a discard in one gesture, whatever the click setting says. */
  protected onDragDiscard(entry: HandTile): void {
    if (!this.store.canAct() || entry.tile === null || !entry.selectable) return;
    this.discard(entry.tile);
  }

  protected onAction(action: ClientAction): void {
    this.selectedSlot.set(null);
    void this.store.submit(action);
  }

  protected onToggle(key: keyof PreSelection): void {
    this.store.togglePreSelection(key);
  }

  private discard(tile: TileStr): void {
    const riichi = this.riichiMode();
    this.selectedSlot.set(null);
    this.riichiMode.set(false);
    void this.store.submit(
      riichi ? { type: 'discard', tile, riichi: true } : { type: 'discard', tile },
    );
  }

  /**
   * Keyboard: `1`–`9` pick a tile, `0` the drawn one, `space` confirms, `Esc` cancels — and passes
   * if there is nothing to cancel, since `Esc` is also the Pass binding (`docs/07-frontend.md` §3).
   */
  protected onKey(event: KeyboardEvent): void {
    this.unlockAudio();
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    // A modal is asking a question. `1`–`9` must not discard behind it, and `Esc` answers *it*.
    if (this.leaving()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.leaving.set(false);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.riichiMode()) {
        this.riichiMode.set(false);
        return;
      }
      if (this.selectedSlot() !== null) {
        this.selectedSlot.set(null);
        return;
      }
      const pass = this.store.prompt()?.options.find((option) => option.type === 'pass');
      if (pass !== undefined) this.onAction({ type: 'pass' });
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      const slot = this.selectedSlot();
      if (slot === null) return;
      event.preventDefault();
      const tile = this.tileAtSlot(slot);
      if (tile !== null) this.discard(tile);
      return;
    }

    if (/^[0-9]$/.test(event.key)) {
      const slot = Number(event.key);
      const tile = this.tileAtSlot(slot);
      if (tile === null) return;
      event.preventDefault();
      this.onPick({
        tile,
        slot,
        drawn: slot === 0,
        selectable: true,
        dora: false,
        key: `key:${String(slot)}`,
      });
    }
  }

  /** Slot 0 is the drawn tile; 1…n index the sorted hand, matching what is on screen. */
  private tileAtSlot(slot: number): TileStr | null {
    const me = this.store.me();
    if (me === null) return null;
    if (slot === 0) return (me.drawn as TileStr | null) ?? null;
    // The same ordering the hand renders with, or the keys pick a different tile than the eye.
    const sorted = this.settings.autoSortHand()
      ? [...(me.hand ?? [])].sort(compareTileStr)
      : [...(me.hand ?? [])];
    const tile = sorted[slot - 1] ?? null;
    if (tile === null) return null;
    const allowed = this.selectableTiles();
    return allowed === null || allowed.includes(tile as TileStr) ? (tile as TileStr) : null;
  }

  // -------------------------------------------------------------------------
  // Connection affordances
  // -------------------------------------------------------------------------

  protected reload(): void {
    globalThis.location?.reload();
  }

  protected reclaim(): void {
    // Open decision 3's default: a seat comes back on the player's next action, not on a request.
    // Reconnecting the socket is what puts them in front of one.
    this.socket.reconnect();
  }

  protected toLobby(): void {
    void this.router.navigate(['/lobby']);
  }

  /**
   * Leave the table, then go to the lobby.
   *
   * The order matters and the `await` is the point: navigating first destroys this component and
   * the socket call with it, so the server would only find out when the socket dropped — which is
   * the same "did they crash or did they go?" the button exists to answer. Navigating even when
   * the call fails is deliberate: a player who has asked to leave is leaving.
   */
  protected async leaveGame(): Promise<void> {
    this.leaving.set(false);
    await this.table.leave(this.tableId());
    this.toLobby();
  }
}
