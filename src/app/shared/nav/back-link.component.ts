import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/**
 * The way out of a screen you navigated into.
 *
 * M5 added three screens reachable from the lobby and gave none of them a way back, which left the
 * browser's own button as the only exit — and on a phone-installed PWA there isn't one.
 *
 * It prefers `Location.back()` over a fixed route so it returns you where you came from: a replay
 * opened from a profile goes back to the profile, not to the lobby. `fallback` covers the case
 * where there is no history to go back to — a shared replay link opened in a new tab — because
 * `back()` there does nothing at all and the button would look broken.
 */
@Component({
  selector: 'mj-back-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mj-back-link' },
  template: `
    <button type="button" data-testid="back" (click)="back()">
      <span aria-hidden="true">←</span>
      <span>{{ label() }}</span>
    </button>
  `,
  styles: `
    button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      min-height: 44px;
      padding: 0 0.8rem 0 0.6rem;
      font: inherit;
      font-size: 0.9rem;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
    }
  `,
})
export class BackLinkComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /** Where to go when there is no history — a link opened directly. */
  readonly fallback = input<string>('/lobby');
  readonly label = input($localize`:@@nav.back:Back`);

  protected back(): void {
    // `Location` has no "can I go back?"; the history length is the only signal available, and a
    // fresh tab is length 1.
    if (globalThis.history?.length > 1) {
      this.location.back();
      return;
    }
    void this.router.navigateByUrl(this.fallback());
  }
}
