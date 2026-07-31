import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SettingsService } from '@core/settings/settings.service';
import type {
  DiscardMode,
  ThemeName,
  TileNaming,
  TileSetName,
  YakuNaming,
} from '@core/settings/settings.service';
import type { Locale } from '@core/i18n/locale';
import { SoundService } from '@core/sound/sound.service';

import { BackLinkComponent } from '@shared/nav/back-link.component';
import { TileComponent } from '@shared/tiles/tile.component';

/**
 * Every preference, in one place.
 *
 * `tasks/backlog.md` M5: *"Settings screen: theme, tile set, yaku naming, sound levels, locale,
 * discard mode."* All six are here, plus the three M4 added behind settings that had no screen to
 * live on (suit colour, dora highlight, auto-sort) — a preference with a store and no control is
 * a hardcoded value with extra steps, which was true in both directions until now.
 *
 * Two things behave unlike the rest and say so in the UI.
 *
 * **Locale reloads.** Translations are installed before Angular bootstraps
 * (`core/i18n/locale.ts`), so a locale change cannot take effect in a running app.
 *
 * **The voice slider is disabled until a pack exists.** Open decision 8 — *"record vs license"* —
 * is undecided and its default is to ship silent. A control that moves a volume with nothing behind
 * it is worse than one that explains why it is off.
 *
 * Changes are stored locally and immediately; there is no Save button because there is nothing to
 * fail. Server-side persistence is a separate matter — `users.settings` exists in
 * `docs/09-database.md` and `docs/06-backend.md` §2 gives `PATCH /users/me` only `displayName` and
 * `avatarId`, so syncing preferences across devices needs an endpoint that is not specified yet.
 */
@Component({
  selector: 'mj-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackLinkComponent, FormsModule, TileComponent],
  host: { class: 'mj-settings', '[attr.data-testid]': '"settings"' },
  template: `
    <main>
      <header>
        <mj-back-link />
        <h1 i18n="@@settings.title">Settings</h1>
      </header>

      <section class="panel">
        <h2 i18n="@@settings.appearance">Appearance</h2>

        <div class="field">
          <span class="label" i18n="@@settings.theme">Theme</span>
          <div
            class="group"
            role="radiogroup"
            i18n-aria-label="@@settings.theme"
            aria-label="Theme"
          >
            @for (option of themes; track option.value) {
              <button
                type="button"
                class="chip"
                role="radio"
                [class.on]="settings.theme() === option.value"
                [attr.aria-checked]="settings.theme() === option.value"
                [attr.data-testid]="'theme-' + option.value"
                (click)="settings.set('theme', option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </div>

        <div class="field">
          <span class="label" i18n="@@settings.tileSet">Tile set</span>
          <div class="group" role="radiogroup" aria-label="Tile set">
            @for (option of tileSets; track option.value) {
              <button
                type="button"
                class="chip tile-chip"
                role="radio"
                [class.on]="settings.tileSet() === option.value"
                [attr.aria-checked]="settings.tileSet() === option.value"
                [attr.data-testid]="'tileset-' + option.value"
                (click)="settings.set('tileSet', option.value)"
              >
                <!-- Each option previews *its own* set, so the choice can be made by looking. -->
                <span class="preview">
                  @for (tile of previewTiles; track tile) {
                    <mj-tile [tile]="tile" size="meld" [set]="option.value" />
                  }
                </span>
                <span>{{ option.label }}</span>
              </button>
            }
          </div>
        </div>

        <label class="check">
          <input
            type="checkbox"
            [ngModel]="settings.suitColour()"
            (ngModelChange)="settings.set('suitColour', $event)"
            name="suitColour"
            data-testid="suit-colour"
          />
          <span i18n="@@settings.suitColour">Colour the suits</span>
        </label>

        <label class="check">
          <input
            type="checkbox"
            [ngModel]="settings.highlightDora()"
            (ngModelChange)="settings.set('highlightDora', $event)"
            name="highlightDora"
            data-testid="highlight-dora"
          />
          <span i18n="@@settings.highlightDora">Highlight dora in your hand</span>
        </label>

        <label class="check">
          <input
            type="checkbox"
            [ngModel]="settings.autoSortHand()"
            (ngModelChange)="settings.set('autoSortHand', $event)"
            name="autoSortHand"
            data-testid="auto-sort"
          />
          <span i18n="@@settings.autoSort">Sort my hand automatically</span>
        </label>
      </section>

      <section class="panel">
        <h2 i18n="@@settings.play">Play</h2>

        <div class="field">
          <span class="label" i18n="@@settings.discardMode">Discard mode</span>
          <div class="group" role="radiogroup" aria-label="Discard mode">
            @for (option of discardModes; track option.value) {
              <button
                type="button"
                class="chip"
                role="radio"
                [class.on]="settings.discardMode() === option.value"
                [attr.aria-checked]="settings.discardMode() === option.value"
                [attr.data-testid]="'discard-' + option.value"
                (click)="settings.set('discardMode', option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
          <p class="hint" i18n="@@settings.discardHint">
            One click is faster and misfires; select-then-confirm is the default for a reason.
          </p>
        </div>

        <div class="field">
          <span class="label" i18n="@@settings.yakuNames">Yaku names</span>
          <div class="group" role="radiogroup" aria-label="Yaku names">
            @for (option of yakuNamings; track option.value) {
              <button
                type="button"
                class="chip"
                role="radio"
                [class.on]="settings.yakuNaming() === option.value"
                [attr.aria-checked]="settings.yakuNaming() === option.value"
                [attr.data-testid]="'yaku-' + option.value"
                (click)="settings.set('yakuNaming', option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
          <p class="hint" data-testid="yaku-sample">{{ yakuSample() }}</p>
        </div>

        <div class="field">
          <span class="label" i18n="@@settings.tileNames">Tile names</span>
          <div class="group" role="radiogroup" aria-label="Tile names">
            @for (option of tileNamings; track option.value) {
              <button
                type="button"
                class="chip"
                role="radio"
                [class.on]="settings.tileNaming() === option.value"
                [attr.aria-checked]="settings.tileNaming() === option.value"
                [attr.data-testid]="'tilenaming-' + option.value"
                (click)="settings.set('tileNaming', option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </div>
      </section>

      <section class="panel">
        <h2 i18n="@@settings.sound">Sound</h2>

        <label class="slider">
          <span i18n="@@settings.sfx">Sound effects</span>
          <input
            type="range"
            min="0"
            max="100"
            [value]="sfxPercent()"
            data-testid="volume-sfx"
            (input)="onVolume('sfx', $event)"
          />
          <span class="value">{{ sfxPercent() }}%</span>
        </label>

        <label class="slider" [class.disabled]="!hasVoice()">
          <span i18n="@@settings.voice">Voice calls</span>
          <input
            type="range"
            min="0"
            max="100"
            [value]="voicePercent()"
            [disabled]="!hasVoice()"
            data-testid="volume-voice"
            (input)="onVolume('voice', $event)"
          />
          <span class="value">{{ voicePercent() }}%</span>
        </label>
        @if (!hasVoice()) {
          <p class="hint" data-testid="voice-note" i18n="@@settings.voiceNote">
            No voice pack is installed, so this game announces calls on screen only.
          </p>
        }

        <button type="button" class="ghost" data-testid="test-sound" (click)="testSound()">
          <ng-container i18n="@@settings.test">Test</ng-container>
        </button>
      </section>

      <section class="panel">
        <h2 i18n="@@settings.motion">Motion</h2>
        <div class="group" role="radiogroup" aria-label="Motion">
          @for (option of motions; track option.label) {
            <button
              type="button"
              class="chip"
              role="radio"
              [class.on]="settings.settings().reduceMotion === option.value"
              [attr.aria-checked]="settings.settings().reduceMotion === option.value"
              [attr.data-testid]="'motion-' + option.key"
              (click)="settings.set('reduceMotion', option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
      </section>

      <section class="panel">
        <h2 i18n="@@settings.language">Language</h2>
        <div class="group" role="radiogroup" aria-label="Language">
          @for (option of locales; track option.value) {
            <button
              type="button"
              class="chip"
              role="radio"
              [class.on]="settings.locale() === option.value"
              [attr.aria-checked]="settings.locale() === option.value"
              [attr.data-testid]="'locale-' + option.value"
              (click)="setLocale(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        <p class="hint" i18n="@@settings.localeHint">Changing the language reloads the app.</p>
      </section>

      <button type="button" class="ghost reset" data-testid="reset-settings" (click)="reset()">
        <ng-container i18n="@@settings.reset">Reset to defaults</ng-container>
      </button>
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
      max-width: 42rem;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
      display: grid;
      gap: 1.25rem;
    }

    header {
      display: grid;
      justify-items: start;
      gap: 0.75rem;
    }

    h1 {
      margin: 0;
      font-size: 2rem;
    }

    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.05rem;
    }

    .panel {
      padding: 1.25rem;
      border-radius: 12px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
      display: grid;
      gap: 0.9rem;
    }

    .field {
      display: grid;
      gap: 0.4rem;
    }

    .label {
      font-size: 0.85rem;
      color: var(--mj-text-muted);
    }

    .group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    button {
      font: inherit;
      min-height: 44px;
      padding: 0 1rem;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
    }

    .chip.on {
      background: var(--mj-accent);
      border-color: var(--mj-accent);
      color: var(--mj-accent-ink);
    }

    .tile-chip {
      display: grid;
      justify-items: center;
      gap: 0.35rem;
      padding: 0.5rem 0.9rem;
      min-height: 0;
    }

    .preview {
      display: flex;
      gap: 2px;
    }

    .check {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 44px;
    }

    .slider {
      display: grid;
      grid-template-columns: 9rem 1fr 3rem;
      align-items: center;
      gap: 0.75rem;
      min-height: 44px;
      font-size: 0.9rem;
    }

    .slider input {
      width: 100%;
      accent-color: var(--mj-accent);
    }

    .slider.disabled {
      opacity: 0.55;
    }

    .value {
      font-variant-numeric: tabular-nums;
      text-align: end;
      color: var(--mj-text-muted);
    }

    .hint {
      margin: 0;
      font-size: 0.8rem;
      color: var(--mj-text-muted);
    }

    .reset {
      justify-self: start;
    }
  `,
})
export class SettingsComponent {
  protected readonly settings = inject(SettingsService);
  private readonly sound = inject(SoundService);

  protected readonly themes: { value: ThemeName; label: string }[] = [
    { value: 'classic-green', label: $localize`:@@settings.themeClassic:Classic green` },
    { value: 'dark', label: $localize`:@@settings.themeDark:Dark` },
  ];

  protected readonly tileSets: { value: TileSetName; label: string }[] = [
    { value: 'traditional', label: $localize`:@@settings.tilesTraditional:Traditional` },
    { value: 'high-contrast', label: $localize`:@@settings.tilesHighContrast:High contrast` },
  ];

  protected readonly discardModes: { value: DiscardMode; label: string }[] = [
    {
      value: 'select-confirm',
      label: $localize`:@@settings.discardSelectConfirm:Select, then confirm`,
    },
    { value: 'one-click', label: $localize`:@@settings.discardOneClick:One click` },
  ];

  protected readonly yakuNamings: { value: YakuNaming; label: string }[] = [
    { value: 'romaji', label: $localize`:@@settings.yakuRomaji:Romaji` },
    { value: 'kanji', label: $localize`:@@settings.yakuKanji:Kanji` },
    { value: 'english', label: $localize`:@@settings.yakuEnglish:English` },
  ];

  protected readonly tileNamings: { value: TileNaming; label: string }[] = [
    { value: 'western', label: $localize`:@@settings.tilesWestern:Western` },
    { value: 'japanese', label: $localize`:@@settings.tilesJapanese:Japanese` },
  ];

  protected readonly locales: { value: Locale; label: string }[] = [
    // Endonyms: a language picker written in a language you cannot read is not a picker.
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
  ];

  protected readonly motions: { key: string; value: boolean | null; label: string }[] = [
    { key: 'system', value: null, label: $localize`:@@settings.motionSystem:Follow the system` },
    { key: 'reduce', value: true, label: $localize`:@@settings.motionReduce:Reduce motion` },
    { key: 'full', value: false, label: $localize`:@@settings.motionFull:Full motion` },
  ];

  protected readonly previewTiles = ['1m', '5p', '1z'] as const;

  protected readonly sfxPercent = computed(() => Math.round(this.settings.sound().sfx * 100));
  protected readonly voicePercent = computed(() => Math.round(this.settings.sound().voice * 100));

  private readonly _hasVoice = signal(this.sound.hasVoice());
  protected readonly hasVoice = this._hasVoice.asReadonly();

  /** The same yaku in whichever naming is selected — the choice made concrete. */
  protected readonly yakuSample = computed(() => {
    switch (this.settings.yakuNaming()) {
      case 'kanji':
        return '立直 · 断幺九 · 混一色';
      case 'english':
        return 'Ready hand · All simples · Half flush';
      default:
        return 'riichi · tanyao · honitsu';
    }
  });

  protected onVolume(channel: 'sfx' | 'voice', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    this.settings.set('sound', { ...this.settings.sound(), [channel]: value });
    // The slider is a user gesture, which is the only moment an `AudioContext` may be created.
    this.sound.unlock();
    if (channel === 'sfx') this.sound.play('discard');
  }

  protected testSound(): void {
    this.sound.unlock();
    this.sound.play('win');
  }

  protected setLocale(locale: Locale): void {
    if (locale === this.settings.locale()) return;
    this.settings.set('locale', locale);
    // Written synchronously by the settings effect, then read back by `installLocale()` on boot.
    globalThis.location?.reload();
  }

  protected reset(): void {
    const locale = this.settings.locale();
    this.settings.reset();
    if (locale !== this.settings.locale()) globalThis.location?.reload();
  }
}
