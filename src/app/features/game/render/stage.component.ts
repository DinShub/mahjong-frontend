import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { OnDestroy } from '@angular/core';

import { ViewportService } from '@core/layout/viewport.service';

/**
 * The scaled stage.
 *
 * A fixed 1600 × 900 (or 900 × 1600 in portrait) box, scaled to fit and centred, so every
 * coordinate inside is resolution-independent: the layout maths is written once, in stage units,
 * and a phone and a 4K monitor differ by one number (`docs/08-graphics-ux.md` §2).
 *
 * The scale is computed in TypeScript because CSS cannot: `scale()` takes a bare number and
 * `calc(100vw / 1600px)` is not a valid CSS expression.
 *
 * **It scales to the box it is given, not to the window.** `ViewportService` measures the viewport,
 * which is right for the game screen — the board is the whole screen there — and wrong for anything
 * that gives the stage less than that. M5's replay viewer puts a transport bar under it, and a
 * stage still scaled for the full viewport had the bottom of the board clipped: the player's own
 * hand, off-screen, which is the same fault the frame below was added to fix. Measuring the host
 * makes both cases the same case, and leaves the game screen's numbers untouched because there the
 * host *is* the viewport.
 */
@Component({
  selector: 'mj-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mj-stage', '[attr.data-testid]': '"stage"' },
  template: `
    <div class="frame" [style]="frameStyle()">
      <div class="surface" [style]="surfaceStyle()" [attr.data-scale]="scaleAttr()">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100dvh;
      overflow: hidden;
      background: var(--mj-felt-edge);
    }

    /*
      The scaled footprint, and the thing that actually gets centred.

      A 1600 × 900 box in a smaller viewport overflows its grid area, and an overflowing item is
      laid out from the start edge rather than centred — so scaling it about its own centre pushed
      the board down and right by exactly the overflow and cut the bottom off. That bottom is where
      the player's own hand is: on any display shorter than 900 css px it was off-screen entirely.

      The scale is min(vw/w, vh/h), so this frame is never larger than the viewport and the grid
      can centre it properly. The surface then scales from its top-left corner and fills it exactly.
    */
    .frame {
      position: relative;
      flex: none;
    }

    .surface {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;
      transform-origin: top left;
    }
  `,
})
export class StageComponent implements OnDestroy {
  private readonly viewport = inject(ViewportService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The host's own box. `null` until the first observation, and wherever there is no observer. */
  private readonly box = signal<{ width: number; height: number } | null>(null);
  private observer: ResizeObserver | null = null;

  /**
   * `min(boxW/stageW, boxH/stageH)`.
   *
   * Falls back to the viewport before the first measurement — and in jsdom, which has no
   * `ResizeObserver` — so the value is never `NaN` and the first paint is never unscaled.
   */
  private readonly fitted = computed(() => {
    const box = this.box();
    if (box === null || box.width <= 0 || box.height <= 0) return this.viewport.scale();
    return Math.min(
      box.width / this.viewport.stageWidth(),
      box.height / this.viewport.stageHeight(),
    );
  });

  constructor() {
    const Observer = globalThis.ResizeObserver;
    if (Observer === undefined) return;
    this.observer = new Observer((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect !== undefined) this.box.set({ width: rect.width, height: rect.height });
    });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  protected readonly surfaceStyle = computed(() => ({
    width: `${String(this.viewport.stageWidth())}px`,
    height: `${String(this.viewport.stageHeight())}px`,
    transform: `scale(${String(this.fitted())})`,
  }));

  /** What the stage occupies once scaled — the box the grid centres. */
  protected readonly frameStyle = computed(() => ({
    width: `${String(this.viewport.stageWidth() * this.fitted())}px`,
    height: `${String(this.viewport.stageHeight() * this.fitted())}px`,
  }));

  /** Exposed for the visual-regression suite, which asserts the scale rather than eyeballing it. */
  protected readonly scaleAttr = computed(() => this.fitted().toFixed(4));
}
