import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { YakuId } from '@contracts/actions';
import { ME } from '@contracts/stats';
import type { GameSummary } from '@contracts/stats';

import { SettingsService } from '@core/settings/settings.service';

import { BackLinkComponent } from '@shared/nav/back-link.component';
import { YAKU_NAMES, yakuName } from '@shared/yaku/yaku-names';

import { ProfileStore } from './profile.store';

/** How many yaku the "most often" list shows before it stops being a list and becomes a table. */
const TOP_YAKU = 8;

/**
 * A player's page: the numbers, then the games behind them.
 *
 * The metrics are exactly the ones `docs/09-database.md` names — *"placement distribution, win
 * rate, deal-in rate, riichi rate, call rate. Anything else is decoration."* — and they are
 * rendered from the stored document without recomputation, because the two stats paths already
 * agree on them and a third calculation here would be a third thing to keep in step.
 *
 * Placement distribution gets the most space because it is the one number a Riichi player actually
 * compares. Average placement sits next to it: 2.50 is the mean of a fair table, so a figure below
 * it is the whole story in one line.
 */
@Component({
  selector: 'mj-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackLinkComponent, DatePipe, DecimalPipe, PercentPipe, RouterLink],
  providers: [ProfileStore],
  host: { class: 'mj-profile', '[attr.data-testid]': '"profile"' },
  template: `
    <main>
      <mj-back-link />
      @if (store.error(); as message) {
        <p class="error" role="alert" data-testid="profile-error">{{ message }}</p>
      } @else if (store.loading()) {
        <p data-testid="profile-loading" i18n="@@profile.loading">Loading…</p>
      } @else if (store.profile()) {
        @let profile = store.profile()!;
        <header>
          <h1 data-testid="profile-name">{{ profile.displayName }}</h1>
          <p class="who">
            @if (profile.isGuest) {
              <span class="tag" i18n="@@profile.guest">guest</span>
            }
            <span>{{ labels.since }} {{ profile.createdAt | date: 'mediumDate' }}</span>
          </p>
        </header>

        @if (stats(); as s) {
          <section class="panel" aria-labelledby="placements-heading">
            <h2 id="placements-heading" i18n="@@profile.placements">Placements</h2>
            @if (s.games === 0) {
              <p class="hint" data-testid="profile-empty" i18n="@@profile.empty">
                No finished games yet. Numbers appear here after the first one.
              </p>
            } @else {
              <div class="bars" data-testid="placement-bars">
                @for (bar of store.placementShares(); track bar.place) {
                  <div class="bar" [attr.data-testid]="'placement-' + bar.place">
                    <div class="track">
                      <div
                        class="fill"
                        [class]="'place-' + bar.place"
                        [style.height.%]="bar.share * 100"
                      ></div>
                    </div>
                    <span class="bar-value">{{ bar.share | percent: '1.0-1' }}</span>
                    <span class="bar-label">{{ ordinal(bar.place) }}</span>
                    <span class="bar-count">{{ bar.count }}</span>
                  </div>
                }
              </div>
              <p class="avg" data-testid="avg-placement">
                <span i18n="@@profile.avgPlacement">Average placement</span>
                <strong>{{ s.avgPlacement | number: '1.2-2' }}</strong>
                <span class="hint" i18n="@@profile.avgPlacementHint"
                  >2.50 is the average of a level table</span
                >
              </p>
            }
          </section>

          <section class="panel" aria-labelledby="rates-heading">
            <h2 id="rates-heading" i18n="@@profile.rates">Rates</h2>
            <dl class="grid" data-testid="profile-rates">
              @for (metric of metrics(); track metric.label) {
                <div class="metric" [attr.data-testid]="'metric-' + metric.key">
                  <dt>{{ metric.label }}</dt>
                  <dd>{{ metric.value }}</dd>
                  @if (metric.note !== null) {
                    <dd class="note">{{ metric.note }}</dd>
                  }
                </div>
              }
            </dl>
          </section>

          @if (topYaku().length > 0) {
            <section class="panel" aria-labelledby="yaku-heading">
              <h2 id="yaku-heading" i18n="@@profile.yaku">Yaku won most</h2>
              <ol class="yaku" data-testid="profile-yaku">
                @for (entry of topYaku(); track entry.id) {
                  <li>
                    <span class="yaku-name">{{ entry.name }}</span>
                    <span class="yaku-count">{{ entry.count }}</span>
                  </li>
                }
              </ol>
              @if (s.yakumanCount > 0) {
                <p class="yakuman" data-testid="profile-yakuman">{{ s.yakumanCount }} yakuman</p>
              }
            </section>
          }
        }

        <section class="panel" aria-labelledby="history-heading">
          <h2 id="history-heading">
            <span i18n="@@profile.games">Games</span>
            <span class="count">{{ store.total() }}</span>
          </h2>
          @if (store.games().length === 0) {
            <p class="hint" i18n="@@profile.noGames">Nothing played yet.</p>
          } @else {
            <ul class="history" data-testid="game-history">
              @for (game of store.games(); track game.gameId) {
                <li [attr.data-testid]="'history-' + game.gameId">
                  <span class="place" [class]="'place-' + (placeOf(game) ?? 0)">
                    {{ placeOf(game) === null ? '—' : ordinal(placeOf(game)!) }}
                  </span>
                  <span class="detail">
                    <span class="line">
                      {{ game.length === 'hanchan' ? labels.hanchan : labels.tonpuusen }} ·
                      {{ game.hands }} hands ·
                      <span class="opponents">{{ opponentsOf(game) }}</span>
                    </span>
                    <span class="line muted">
                      {{ game.startedAt | date: 'short' }}
                      @if (game.status !== 'finished') {
                        ·
                        <span class="tag">{{
                          game.status === 'in_progress' ? 'live' : 'abandoned'
                        }}</span>
                      }
                    </span>
                  </span>
                  <span class="score">{{ scoreOf(game) }}</span>
                  @if (game.status === 'finished') {
                    <a
                      class="replay"
                      [routerLink]="['/replay', game.gameId]"
                      [attr.data-testid]="'replay-link-' + game.gameId"
                      >{{ labels.replay }}</a
                    >
                  }
                </li>
              }
            </ul>
            @if (store.hasMore()) {
              <button
                type="button"
                class="ghost more"
                data-testid="load-more"
                [disabled]="store.loadingMore()"
                (click)="more()"
              >
                {{ store.loadingMore() ? labels.loading : labels.loadMore }}
              </button>
            }
          }
        </section>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--mj-felt);
      color: var(--mj-text);
    }

    main {
      max-width: 52rem;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
      display: grid;
      gap: 1.5rem;
    }

    h1 {
      margin: 0;
      font-size: 2rem;
    }

    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.05rem;
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .count {
      font-size: 0.85rem;
      font-weight: 400;
      color: var(--mj-text-muted);
    }

    .who {
      margin: 0.25rem 0 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--mj-text-muted);
      font-size: 0.9rem;
    }

    .tag {
      padding: 1px 7px;
      border-radius: 4px;
      background: var(--mj-surface-raised);
      font-size: 11px;
    }

    .panel {
      padding: 1.25rem;
      border-radius: 12px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
    }

    .bars {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      align-items: end;
    }

    .bar {
      display: grid;
      justify-items: center;
      gap: 0.25rem;
    }

    .track {
      width: 100%;
      height: 7rem;
      display: flex;
      align-items: flex-end;
      border-radius: 6px;
      background: var(--mj-felt-edge);
      overflow: hidden;
    }

    .fill {
      width: 100%;
      min-height: 2px;
      border-radius: 6px 6px 0 0;
      background: var(--mj-accent);
      transition: height 200ms ease;
    }

    .fill.place-1 {
      background: #d9a441;
    }
    .fill.place-2 {
      background: #9fb3c8;
    }
    .fill.place-3 {
      background: #a8825c;
    }
    .fill.place-4 {
      background: var(--mj-text-muted);
    }

    .bar-value {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }

    .bar-label,
    .bar-count {
      font-size: 0.8rem;
      color: var(--mj-text-muted);
    }

    .avg {
      margin: 1rem 0 0;
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .avg strong {
      font-size: 1.25rem;
      font-variant-numeric: tabular-nums;
    }

    .grid {
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      gap: 1rem;
    }

    .metric dt {
      font-size: 0.8rem;
      color: var(--mj-text-muted);
    }

    .metric dd {
      margin: 0.15rem 0 0;
      font-size: 1.25rem;
      font-variant-numeric: tabular-nums;
    }

    .metric dd.note {
      font-size: 0.75rem;
      color: var(--mj-text-muted);
    }

    .yaku {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.35rem;
    }

    .yaku li {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.9rem;
    }

    .yaku-count {
      font-variant-numeric: tabular-nums;
      color: var(--mj-text-muted);
    }

    .yakuman {
      margin: 0.75rem 0 0;
      font-size: 0.85rem;
      color: #d9a441;
    }

    .history {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.5rem;
    }

    .history li {
      display: grid;
      grid-template-columns: 2.5rem 1fr auto auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.75rem;
      border-radius: 8px;
      background: var(--mj-felt-edge);
    }

    .place {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .place.place-1 {
      color: #d9a441;
    }

    .detail {
      display: grid;
      min-width: 0;
    }

    .line {
      font-size: 0.9rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .line.muted {
      font-size: 0.78rem;
      color: var(--mj-text-muted);
    }

    .score {
      font-variant-numeric: tabular-nums;
    }

    .replay {
      color: var(--mj-accent);
      font-size: 0.85rem;
      text-decoration: none;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      padding: 0 0.4rem;
    }

    .more {
      margin-block-start: 0.75rem;
    }

    button {
      font: inherit;
      min-height: 44px;
      padding: 0 1.2rem;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
    }

    .hint {
      margin: 0;
      font-size: 0.85rem;
      color: var(--mj-text-muted);
    }

    .error {
      color: var(--mj-danger);
    }
  `,
})
export class ProfileComponent implements OnInit {
  protected readonly store = inject(ProfileStore);
  private readonly settings = inject(SettingsService);

  /** From the route. Absent on `/profile`, which means "me". */
  readonly userId = input<string | undefined>(undefined);

  protected readonly stats = this.store.stats;

  /** Strings used inside expressions, where an `i18n` attribute cannot reach. */
  protected readonly labels = {
    since: $localize`:@@profile.since:Playing since`,
    loading: $localize`:@@profile.loading:Loading…`,
    loadMore: $localize`:@@profile.loadMore:Load more`,
    replay: $localize`:@@profile.replay:Replay`,
    hanchan: $localize`:@@profile.hanchan:Hanchan`,
    tonpuusen: $localize`:@@profile.tonpuusen:Tonpuusen`,
  };

  private readonly target = computed(() => this.userId() ?? ME);

  protected readonly metrics = computed(() => {
    const stats = this.stats();
    if (stats === null) return [];
    const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
    return [
      {
        key: 'win',
        label: $localize`:@@profile.winRate:Win rate`,
        value: pct(stats.winRate),
        note: `${String(stats.wins)} wins`,
      },
      {
        key: 'dealin',
        label: $localize`:@@profile.dealInRate:Deal-in rate`,
        value: pct(stats.dealInRate),
        note: `${stats.dealIns} deal-ins`,
      },
      {
        key: 'riichi',
        label: $localize`:@@profile.riichiRate:Riichi rate`,
        value: pct(stats.riichiRate),
        note: `won ${pct(stats.riichiWinRate)} of them`,
      },
      {
        key: 'call',
        label: $localize`:@@profile.callRate:Call rate`,
        value: pct(stats.callRate),
        note: null,
      },
      {
        key: 'tsumo',
        label: $localize`:@@profile.tsumoShare:Tsumo share`,
        value: stats.wins === 0 ? '—' : pct(stats.tsumoWins / stats.wins),
        note: null,
      },
      {
        key: 'winpoints',
        label: $localize`:@@profile.avgWin:Average win`,
        value: Math.round(stats.avgWinPoints).toLocaleString(),
        note: `on turn ${stats.avgWinTurn.toFixed(1)}`,
      },
      {
        key: 'dealinpoints',
        label: $localize`:@@profile.avgDealIn:Average deal-in`,
        value: Math.round(stats.avgDealInPoints).toLocaleString(),
        note: null,
      },
      {
        key: 'tenpai',
        label: $localize`:@@profile.tenpaiAtDraw:Tenpai at draw`,
        value: stats.drawsPlayed === 0 ? '—' : pct(stats.tenpaiAtDraw / stats.drawsPlayed),
        note: `${stats.drawsPlayed} exhaustive draws`,
      },
    ];
  });

  /** The yaku a player actually wins with, in the naming they chose. */
  protected readonly topYaku = computed(() => {
    const counts = this.stats()?.yakuCounts ?? {};
    const naming = this.settings.yakuNaming();
    return Object.entries(counts)
      .filter(([id]) => id in YAKU_NAMES)
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_YAKU)
      .map(([id, count]) => ({ id, count, name: yakuName(id as YakuId, naming) }));
  });

  ngOnInit(): void {
    void this.store.load(this.target());
  }

  protected more(): void {
    void this.store.loadMore(this.target());
  }

  protected ordinal(place: number): string {
    return ['', '1st', '2nd', '3rd', '4th'][place] ?? String(place);
  }

  protected placeOf(game: GameSummary): number | null {
    const seat = game.seat;
    if (seat === null) return null;
    return game.players[seat]?.placement ?? null;
  }

  protected scoreOf(game: GameSummary): string {
    const seat = game.seat;
    if (seat === null) return '';
    const score = game.players[seat]?.finalScore;
    return score == null ? '' : score.toLocaleString();
  }

  protected opponentsOf(game: GameSummary): string {
    return game.players
      .filter((_player, seat) => seat !== game.seat)
      .map((player) => player.displayName)
      .join(', ');
  }
}
