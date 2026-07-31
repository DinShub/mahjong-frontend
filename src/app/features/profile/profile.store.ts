import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { gameHistoryPageSchema, userProfileSchema } from '@contracts/schemas';
import { GAME_HISTORY_PAGE_SIZE, ME, STATS_ROUTES } from '@contracts/stats';
import type { GameSummary, UserProfile } from '@contracts/stats';

import { APP_CONFIG } from '@core/config/app-config';

/**
 * A profile: the aggregates, and the history under them.
 *
 * Two requests, deliberately. `docs/09-database.md` makes `playerStats` *"one read"* precisely so a
 * profile does not have to aggregate anything at render time — and the history is paginated, so it
 * cannot be part of that read without either bounding the profile or unbounding the page.
 *
 * The history appends rather than replaces: "load more" is the interaction, and a cursor page that
 * replaced the list would make the button a way to lose your place.
 */
@Injectable()
export class ProfileStore {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _games = signal<GameSummary[]>([]);
  private readonly _cursor = signal<string | null>(null);
  private readonly _total = signal(0);
  private readonly _loading = signal(false);
  private readonly _loadingMore = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly games = this._games.asReadonly();
  readonly total = this._total.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadingMore = this._loadingMore.asReadonly();
  readonly error = this._error.asReadonly();

  readonly hasMore = computed(() => this._cursor() !== null);

  readonly stats = computed(() => this._profile()?.stats ?? null);

  /**
   * The placement bars, as percentages of games played.
   *
   * Zero games gives four zero-height bars rather than a division by zero — a new player's profile
   * is a real page, and "no data yet" is what an empty chart says on its own.
   */
  readonly placementShares = computed(() => {
    const stats = this.stats();
    const games = stats?.games ?? 0;
    return (stats?.placements ?? [0, 0, 0, 0]).map((count, index) => ({
      place: index + 1,
      count,
      share: games === 0 ? 0 : count / games,
    }));
  });

  async load(userId: string = ME): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    this._profile.set(null);
    this._games.set([]);
    this._cursor.set(null);
    try {
      const [profile, page] = await Promise.all([
        this.get<unknown>(STATS_ROUTES.profile(userId)),
        this.get<unknown>(`${STATS_ROUTES.games(userId)}?limit=${String(GAME_HISTORY_PAGE_SIZE)}`),
      ]);
      this._profile.set(userProfileSchema.parse(profile) as UserProfile);
      const parsed = gameHistoryPageSchema.parse(page);
      this._games.set(parsed.games as GameSummary[]);
      this._cursor.set(parsed.nextCursor);
      this._total.set(parsed.total);
    } catch (error) {
      this._error.set(describeError(error));
    } finally {
      this._loading.set(false);
    }
  }

  async loadMore(userId: string = ME): Promise<void> {
    const cursor = this._cursor();
    if (cursor === null || this._loadingMore()) return;
    this._loadingMore.set(true);
    try {
      const page = gameHistoryPageSchema.parse(
        await this.get<unknown>(
          `${STATS_ROUTES.games(userId)}?limit=${String(GAME_HISTORY_PAGE_SIZE)}&cursor=${cursor}`,
        ),
      );
      this._games.update((games) => [...games, ...(page.games as GameSummary[])]);
      this._cursor.set(page.nextCursor);
      this._total.set(page.total);
    } catch (error) {
      this._error.set(describeError(error));
    } finally {
      this._loadingMore.set(false);
    }
  }

  private get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${this.config.apiUrl}${path}`));
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error ? error.message : 'the profile could not be loaded';
  }
  if (error.status === 404) return 'No such player.';
  return error.status === 0 ? 'The server is unreachable.' : 'The profile could not be loaded.';
}
