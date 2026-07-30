import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

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
export class StageComponent {
  private readonly viewport = inject(ViewportService);

  protected readonly surfaceStyle = computed(() => ({
    width: `${String(this.viewport.stageWidth())}px`,
    height: `${String(this.viewport.stageHeight())}px`,
    transform: `scale(${String(this.viewport.scale())})`,
  }));

  /** What the stage occupies once scaled — the box the grid centres. */
  protected readonly frameStyle = computed(() => ({
    width: `${String(this.viewport.stageWidth() * this.viewport.scale())}px`,
    height: `${String(this.viewport.stageHeight() * this.viewport.scale())}px`,
  }));

  /** Exposed for the visual-regression suite, which asserts the scale rather than eyeballing it. */
  protected readonly scaleAttr = computed(() => this.viewport.scale().toFixed(4));
}
