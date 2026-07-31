import { Injectable, computed, effect, signal } from '@angular/core';

import { DEFAULT_LOCALE, STORAGE_KEY } from '@core/i18n/locale';
import type { Locale } from '@core/i18n/locale';

/**
 * Player preferences.
 *
 * Everything here changes how the board looks or responds and nothing here changes what is legal.
 * The settings *screen* is M5; the settings themselves are M4's, because half the render and input
 * items in the backlog are "…behind a setting" and a preference with no store is a hardcoded value
 * with extra steps.
 */
export type ThemeName = 'classic-green' | 'dark';
export type TileSetName = 'traditional' | 'high-contrast';
export type TileNaming = 'western' | 'japanese';
export type YakuNaming = 'romaji' | 'kanji' | 'english';
export type DiscardMode = 'select-confirm' | 'one-click';

export interface Settings {
  theme: ThemeName;
  tileSet: TileSetName;
  /** Man/pin/sou tinted differently — an accessibility aid, off by default (`docs/08` §3). */
  suitColour: boolean;
  /** `one-click` is for experienced players; the default costs a click and saves misdiscards. */
  discardMode: DiscardMode;
  tileNaming: TileNaming;
  yakuNaming: YakuNaming;
  /** Outline the dora in your own hand. */
  highlightDora: boolean;
  autoSortHand: boolean;
  /** `null` follows `prefers-reduced-motion`; `true`/`false` override it. */
  reduceMotion: boolean | null;
  /**
   * **[M5]** `en` or `ja`. Read before bootstrap by `core/i18n/locale.ts` as well as here, because
   * `loadTranslations()` has to run before the injector exists.
   */
  locale: Locale;
  /**
   * **[M5]** Per-channel volume, 0…1. `docs/08-graphics-ux.md` §7 keeps SFX and voice separate and
   * turns voice off by default on mobile; open decision 8's default — *"Ship silent; voice is
   * optional"* — is why `voice` starts at 0 rather than at a level with nothing to play.
   */
  sound: { sfx: number; voice: number };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'classic-green',
  tileSet: 'traditional',
  suitColour: false,
  discardMode: 'select-confirm',
  tileNaming: 'western',
  yakuNaming: 'romaji',
  highlightDora: true,
  autoSortHand: true,
  reduceMotion: null,
  locale: DEFAULT_LOCALE,
  sound: { sfx: 0.7, voice: 0 },
};

export { STORAGE_KEY };

function read(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge rather than replace: a setting added in a later release must not reset the others.
    // `sound` is merged one level deeper for the same reason — a stored `{ sfx }` from before the
    // voice channel existed must not leave `voice` undefined for a slider to bind to.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      sound: { ...DEFAULT_SETTINGS.sound, ...(parsed.sound ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<Settings>(read());
  readonly settings = this._settings.asReadonly();

  private readonly systemReducedMotion = signal(matchReducedMotion());

  readonly theme = computed(() => this._settings().theme);
  readonly tileSet = computed(() => this._settings().tileSet);
  readonly discardMode = computed(() => this._settings().discardMode);
  readonly tileNaming = computed(() => this._settings().tileNaming);
  readonly yakuNaming = computed(() => this._settings().yakuNaming);
  readonly highlightDora = computed(() => this._settings().highlightDora);
  readonly autoSortHand = computed(() => this._settings().autoSortHand);
  readonly suitColour = computed(() => this._settings().suitColour);
  readonly locale = computed(() => this._settings().locale);
  readonly sound = computed(() => this._settings().sound);

  /** The setting wins where the player expressed one; otherwise the operating system does. */
  readonly reducedMotion = computed(
    () => this._settings().reduceMotion ?? this.systemReducedMotion(),
  );

  constructor() {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    query?.addEventListener('change', (event) => {
      this.systemReducedMotion.set(event.matches);
    });

    // The theme class is a *render* concern and an effect is the right shape for it. Persistence
    // is not — see {@link persist}.
    effect(() => {
      applyThemeClass(this._settings().theme);
    });
    // …and once at construction, before the first effect runs, because the app initializer
    // constructs this service precisely so the stored theme is on the page before first paint.
    applyThemeClass(this._settings().theme);
  }

  /**
   * Write to storage **synchronously**, at the point the setting changes.
   *
   * This used to live in the effect above, and it was wrong in a way only an end-to-end test
   * found: Angular schedules effects, so `set('locale', 'ja')` followed by `location.reload()`
   * reloaded before the write landed and the app came back in English. The same race made a
   * setting changed immediately before a `router.navigate` unreliable.
   *
   * A preference is not derived state, and storing it is not a side effect of rendering.
   */
  private persist(settings: Settings): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing: the preference holds for this session and no longer.
    }
  }

  update(patch: Partial<Settings>): void {
    const next = { ...this._settings(), ...patch };
    this.persist(next);
    this._settings.set(next);
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.update({ [key]: value } as Partial<Settings>);
  }

  reset(): void {
    this.persist(DEFAULT_SETTINGS);
    this._settings.set(DEFAULT_SETTINGS);
  }
}

function matchReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function applyThemeClass(theme: ThemeName): void {
  const root = globalThis.document?.documentElement;
  if (root === undefined) return;
  root.classList.remove('theme-classic-green', 'theme-dark');
  root.classList.add(`theme-${theme}`);
  root.dataset['theme'] = theme;
}
