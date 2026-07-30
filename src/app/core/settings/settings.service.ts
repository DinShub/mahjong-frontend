import { Injectable, computed, effect, signal } from '@angular/core';

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
};

const STORAGE_KEY = 'mj.settings.v1';

function read(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge rather than replace: a setting added in a later release must not reset the others.
    return { ...DEFAULT_SETTINGS, ...parsed };
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

  /** The setting wins where the player expressed one; otherwise the operating system does. */
  readonly reducedMotion = computed(
    () => this._settings().reduceMotion ?? this.systemReducedMotion(),
  );

  constructor() {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    query?.addEventListener('change', (event) => {
      this.systemReducedMotion.set(event.matches);
    });

    effect(() => {
      const settings = this._settings();
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // Private browsing: the preference holds for this session and no longer.
      }
      applyThemeClass(settings.theme);
    });
  }

  update(patch: Partial<Settings>): void {
    this._settings.update((current) => ({ ...current, ...patch }));
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.update({ [key]: value } as Partial<Settings>);
  }

  reset(): void {
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
