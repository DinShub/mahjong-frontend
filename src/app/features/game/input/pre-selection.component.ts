import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { PreSelection } from '../state/game.store';

/**
 * The auto-buttons.
 *
 * Persistent toggles that fire the moment a matching prompt arrives — what experienced players
 * expect (`docs/07-frontend.md` §3). Two things make them safe rather than a way to throw a hand
 * away: they are unmistakably marked while armed, and they are cleared at the end of every hand,
 * so an auto-pass armed to sit out one dangerous hand does not survive into the next one.
 */
@Component({
  selector: 'mj-pre-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mj-pre-selection', '[attr.data-testid]': '"pre-selection"' },
  template: `
    <button
      type="button"
      class="toggle"
      [class.armed]="state().autoWin"
      [attr.aria-pressed]="state().autoWin"
      data-testid="auto-win"
      (click)="armToggled.emit('autoWin')"
    >
      Auto win
    </button>
    <button
      type="button"
      class="toggle"
      [class.armed]="state().autoPass"
      [attr.aria-pressed]="state().autoPass"
      data-testid="auto-pass"
      (click)="armToggled.emit('autoPass')"
    >
      Auto pass
    </button>
    <button
      type="button"
      class="toggle"
      [class.armed]="state().autoTsumogiri"
      [attr.aria-pressed]="state().autoTsumogiri"
      data-testid="auto-tsumogiri"
      (click)="armToggled.emit('autoTsumogiri')"
    >
      Auto discard
    </button>
  `,
  styles: `
    :host {
      display: flex;
      gap: 4px;
    }

    .toggle {
      font: inherit;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--mj-line);
      background: color-mix(in srgb, var(--mj-felt-edge) 70%, transparent);
      color: var(--mj-text-muted);
      cursor: pointer;
    }

    /* Armed is a filled pill *and* a dot, so it is not colour alone. */
    .toggle.armed {
      background: var(--mj-accent);
      border-color: var(--mj-accent);
      color: var(--mj-accent-ink);
      font-weight: 700;
    }

    .toggle.armed::before {
      content: '● ';
    }
  `,
})
export class PreSelectionComponent {
  readonly state = input.required<PreSelection>();
  readonly armToggled = output<keyof PreSelection>();
}
