import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';

import type { AgariEvent, RyuukyokuEvent, Seat } from '@contracts/actions';

import { ViewportService } from '@core/layout/viewport.service';

import { AgariOverlayComponent } from '@features/game/overlays/agari-overlay.component';
import { RyuukyokuOverlayComponent } from '@features/game/overlays/ryuukyoku-overlay.component';
import { BoardPortraitComponent } from '@features/game/render/board-portrait.component';
import { BoardComponent } from '@features/game/render/board.component';
import { StageComponent } from '@features/game/render/stage.component';

import { ReplayStore, SPEEDS } from './replay.store';
import type { ReplaySpeed, ReplayViewer } from './replay.store';
import { verifyReplay } from './verify-seed';
import type { SeedVerdict } from './verify-seed';

/**
 * The replay viewer.
 *
 * `docs/07-frontend.md` §5: *"the same render layer, fed from a fetched log instead of a socket,
 * with a transport bar (play/pause, step, seek by hand, speed) and `mySeat` selectable to any of
 * the 4 (or 'all revealed')."* Every one of those is a call into {@link ReplayStore}; this
 * component owns no game state at all, which is why the board it renders is the same
 * `<mj-board>` the live game renders and not a read-only copy of one.
 *
 * The seed button is the other half of `docs/11-nonfunctional.md` §1's commit-reveal: the server
 * published `sha256(seed)` before the deal and the seed itself at the end, and this checks the two
 * against a wall it derives itself. See `verify-seed.ts` for why that code is deliberately not
 * shared with the server's.
 */
@Component({
  selector: 'mj-replay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgariOverlayComponent,
    BoardComponent,
    BoardPortraitComponent,
    RyuukyokuOverlayComponent,
    StageComponent,
  ],
  providers: [ReplayStore],
  host: {
    class: 'mj-replay',
    '(window:keydown)': 'onKey($event)',
    '[attr.data-testid]': '"replay"',
  },
  template: `
    @if (store.error(); as message) {
      <div class="notice" role="alert" data-testid="replay-error">
        <h1 i18n="@@replay.unavailable">Replay unavailable</h1>
        <p>{{ message }}</p>
      </div>
    } @else if (store.loading()) {
      <div class="notice" data-testid="replay-loading"><p i18n="@@replay.loading">Loading replay…</p></div>
    } @else if (store.view()) {
      @let view = store.view()!;
      <mj-stage>
        @if (viewport.isPortrait()) {
          <mj-board-portrait [view]="view" [revealAll]="store.revealAll()" [uraIndicators]="[]" />
        } @else {
          <mj-board [view]="view" [revealAll]="store.revealAll()" [uraIndicators]="[]" />
        }

        @if (agari(); as event) {
          <mj-agari-overlay [event]="event" [players]="players()" />
        }
        @if (ryuukyoku(); as event) {
          <mj-ryuukyoku-overlay [event]="event" [players]="players()" />
        }
      </mj-stage>

      <div class="transport" data-testid="replay-transport">
        <div class="row">
          <button
            type="button"
            class="ghost"
            [title]="labels.prevHand"
            [attr.aria-label]="labels.prevHand"
            data-testid="replay-prev-hand"
            (click)="store.seekHand(-1)"
          >
            ⏮
          </button>
          <button
            type="button"
            class="ghost"
            [title]="labels.stepBack"
            [attr.aria-label]="labels.stepBack"
            data-testid="replay-step-back"
            (click)="store.step(-1)"
          >
            ◀
          </button>
          <button
            type="button"
            class="primary"
            [attr.aria-pressed]="store.playing()"
            [attr.aria-label]="store.playing() ? labels.pause : labels.play"
            data-testid="replay-play"
            (click)="store.toggle()"
          >
            {{ store.playing() ? '❚❚' : '▶' }}
          </button>
          <button
            type="button"
            class="ghost"
            [title]="labels.stepForward"
            [attr.aria-label]="labels.stepForward"
            data-testid="replay-step"
            (click)="store.step(1)"
          >
            ▶
          </button>
          <button
            type="button"
            class="ghost"
            [title]="labels.nextHand"
            [attr.aria-label]="labels.nextHand"
            data-testid="replay-next-hand"
            (click)="store.seekHand(1)"
          >
            ⏭
          </button>

          <label class="scrub">
            <span class="sr-only">{{ labels.position }}</span>
            <input
              type="range"
              min="0"
              [max]="store.total()"
              [value]="store.cursor()"
              data-testid="replay-scrub"
              (input)="onScrub($event)"
            />
          </label>

          <span class="counter" data-testid="replay-position">
            {{ handLabel() }} · {{ store.cursor() }}/{{ store.total() }}
          </span>
        </div>

        <div class="row">
          <div class="group seats" role="group" [attr.aria-label]="labels.viewpoint">
            @for (option of seatOptions(); track option.value) {
              <button
                type="button"
                class="chip"
                [class.on]="store.viewer() === option.value"
                [attr.aria-pressed]="store.viewer() === option.value"
                [attr.data-testid]="'replay-seat-' + option.value"
                (click)="store.setViewer(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>

          <div class="group" role="group" [attr.aria-label]="labels.speed">
            @for (option of speeds; track option) {
              <button
                type="button"
                class="chip"
                [class.on]="store.speed() === option"
                [attr.aria-pressed]="store.speed() === option"
                [attr.data-testid]="'replay-speed-' + option"
                (click)="store.setSpeed(option)"
              >
                {{ option }}×
              </button>
            }
          </div>

          <button
            type="button"
            class="ghost verify"
            data-testid="replay-verify"
            [disabled]="verifying()"
            (click)="verify()"
          >
            {{ verifying() ? labels.verifying : labels.verify }}
          </button>
        </div>

        @if (verdictText(); as text) {
          <p
            class="verdict"
            [class.bad]="verdict()?.status !== 'ok'"
            role="status"
            data-testid="replay-verdict"
          >
            {{ text }}
          </p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      /*
        minmax(0, 1fr), not 1fr: a grid item's automatic minimum is its content, and the stage's
        content is a board scaled for the whole viewport. With a plain 1fr the row grows to fit it
        and the transport bar is pushed off the bottom of a phone — where it still receives the
        clicks aimed at it, which is how this was found.
      */
      grid-template-rows: minmax(0, 1fr) auto;
      grid-template-columns: minmax(0, 1fr);
      height: 100dvh;
      width: 100%;
      overflow: hidden;
      background: var(--mj-felt-edge);
      color: var(--mj-text);
    }

    /*
      mj-stage sets height:100dvh on its own :host, which is right for the game screen — the board
      is the whole screen there. Here it is the top row of a grid whose second row is the transport
      bar, and a child that insists on the full viewport pushes the controls off the bottom of a
      phone. ":host mj-stage" outranks a bare ":host", so this is the one selector that can say
      otherwise.
    */
    :host mj-stage {
      height: 100%;
      min-height: 0;
    }

    .notice {
      display: grid;
      place-content: center;
      gap: 0.5rem;
      padding: 4rem 1.5rem;
      text-align: center;
    }

    .transport {
      display: grid;
      /* Same automatic-minimum trap as the rows above, in the other axis. */
      min-width: 0;
      gap: 0.5rem;
      padding: 0.75rem 1rem 1rem;
      background: var(--mj-surface);
      border-block-start: 1px solid var(--mj-line);
    }

    .row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      min-width: 0;
    }

    /*
      The seat picker holds four player names and never fits a phone. Scrolling it sideways keeps
      every chip reachable and full-size; wrapping it would push the speed controls off-screen, and
      shrinking the chips would put four 24px targets on a touchscreen.
    */
    .group.seats {
      flex: 1 1 100%;
      min-width: 0;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: thin;
      padding-block-end: 2px;
    }

    .group.seats .chip {
      flex: none;
      max-width: 9rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .scrub {
      flex: 1 1 12rem;
      display: flex;
    }

    .scrub input {
      width: 100%;
      accent-color: var(--mj-accent);
    }

    .counter {
      font-variant-numeric: tabular-nums;
      font-size: 0.85rem;
      color: var(--mj-text-muted);
      white-space: nowrap;
    }

    button {
      font: inherit;
      min-height: 44px;
      min-width: 44px;
      padding: 0 0.9rem;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
    }

    button.primary {
      background: var(--mj-accent);
      border-color: var(--mj-accent);
      color: var(--mj-accent-ink);
    }

    button[disabled] {
      opacity: 0.6;
      cursor: default;
    }

    .group {
      display: flex;
      gap: 0.25rem;
    }

    .chip {
      min-height: 36px;
      min-width: 36px;
      padding: 0 0.7rem;
      font-size: 0.85rem;
    }

    .chip.on {
      background: var(--mj-accent);
      border-color: var(--mj-accent);
      color: var(--mj-accent-ink);
    }

    .verify {
      margin-inline-start: auto;
    }

    .verdict {
      margin: 0;
      font-size: 0.85rem;
      color: var(--mj-ok, var(--mj-text-muted));
    }

    .verdict.bad {
      color: var(--mj-danger);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class ReplayComponent implements OnInit, OnDestroy {
  protected readonly store = inject(ReplayStore);
  protected readonly viewport = inject(ViewportService);

  /** From the route (`withComponentInputBinding`). */
  readonly gameId = input.required<string>();

  protected readonly speeds = SPEEDS;

  /**
   * Strings that reach the DOM as attributes rather than as text.
   *
   * `i18n` marks element *content*; an `aria-label` or a `title` needs `i18n-aria-label`, which
   * would put six more attributes on every button. Binding to a `$localize` constant says the same
   * thing once and keeps the template readable.
   */
  protected readonly labels = {
    prevHand: $localize`:@@replay.prevHand:Previous hand`,
    nextHand: $localize`:@@replay.nextHand:Next hand`,
    stepBack: $localize`:@@replay.stepBack:Step back one event`,
    stepForward: $localize`:@@replay.stepForward:Step forward one event`,
    play: $localize`:@@replay.play:Play`,
    pause: $localize`:@@replay.pause:Pause`,
    position: $localize`:@@replay.position:Position`,
    viewpoint: $localize`:@@replay.viewpoint:Viewpoint`,
    speed: $localize`:@@replay.speed:Speed`,
    verify: $localize`:@@replay.verify:Verify the wall`,
    verifying: $localize`:@@replay.verifying:Verifying…`,
  };

  private readonly _verdict = signal<SeedVerdict | null>(null);
  private readonly _verifying = signal(false);
  protected readonly verdict = this._verdict.asReadonly();
  protected readonly verifying = this._verifying.asReadonly();

  protected readonly players = computed(() => this.store.log()?.players ?? []);

  protected readonly seatOptions = computed<{ value: ReplayViewer; label: string }[]>(() => {
    const players = this.players();
    const seats = ([0, 1, 2, 3] as Seat[]).map((seat) => ({
      value: seat as ReplayViewer,
      label: players[seat]?.displayName ?? `Seat ${String(seat)}`,
    }));
    return [...seats, { value: 'all' as const, label: $localize`:@@replay.allRevealed:All revealed` }];
  });

  protected readonly handLabel = computed(() => {
    const hand = this.store.currentHand();
    if (hand === null) return '—';
    const winds = ['East', 'South', 'West', 'North'];
    const honba = hand.honba > 0 ? `-${String(hand.honba)}` : '';
    return `${winds[hand.round] ?? '?'} ${String(hand.kyoku)}${honba}`;
  });

  protected readonly agari = computed<AgariEvent | null>(() => {
    const result = this.store.handResult();
    return result?.t === 'agari' ? result : null;
  });

  protected readonly ryuukyoku = computed<RyuukyokuEvent | null>(() => {
    const result = this.store.handResult();
    return result?.t === 'ryuukyoku' ? result : null;
  });

  protected readonly verdictText = computed(() => {
    const verdict = this._verdict();
    if (verdict === null) return null;
    switch (verdict.status) {
      case 'ok':
        return `Verified: the seed matches the hash published before the game, and all ${String(
          verdict.hands.length,
        )} deals follow from it.`;
      case 'hash-mismatch':
        return 'The seed does not match the hash published at the start of this game.';
      case 'deal-mismatch': {
        const bad = verdict.hands.filter((hand) => !hand.matches).map((hand) => hand.handIndex + 1);
        return `The seed is genuine but hand ${bad.join(', ')} was not dealt from it.`;
      }
      case 'unverifiable':
        return `Could not verify: ${verdict.reason}.`;
    }
  });

  ngOnInit(): void {
    void this.store.load(this.gameId());
  }

  ngOnDestroy(): void {
    this.store.destroy();
  }

  protected onScrub(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.seek(Number(target.value));
  }

  /** Space to play/pause, arrows to step, `[` / `]` for hands — a video player's bindings. */
  protected onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.store.toggle();
        return;
      case 'ArrowRight':
        this.store.step(1);
        return;
      case 'ArrowLeft':
        this.store.step(-1);
        return;
      case ']':
        this.store.seekHand(1);
        return;
      case '[':
        this.store.seekHand(-1);
        return;
      default:
        return;
    }
  }

  protected async verify(): Promise<void> {
    const log = this.store.log();
    if (log === null) return;
    this._verifying.set(true);
    try {
      this._verdict.set(await verifyReplay(log));
    } finally {
      this._verifying.set(false);
    }
  }
}

/** Re-exported so the route file does not have to know about the speed tuple's type. */
export type { ReplaySpeed };
