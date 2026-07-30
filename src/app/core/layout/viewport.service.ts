import { Injectable, computed, signal } from '@angular/core';

/** Stage units. Every coordinate in the render layer is in these (`docs/08-graphics-ux.md` §2). */
export const STAGE_WIDTH = 1600;
export const STAGE_HEIGHT = 900;

/**
 * Below this the desktop board switches to the portrait layout — a different module, not a
 * narrower version of the same one. The landscape board does not survive being squeezed: four
 * ponds around a centre panel stop being readable long before they stop fitting.
 */
export const PORTRAIT_BREAKPOINT = 900;

export const PORTRAIT_WIDTH = 900;
export const PORTRAIT_HEIGHT = 1600;

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly _width = signal(globalThis.innerWidth || STAGE_WIDTH);
  private readonly _height = signal(globalThis.innerHeight || STAGE_HEIGHT);

  readonly width = this._width.asReadonly();
  readonly height = this._height.asReadonly();

  readonly isPortrait = computed(() => this._width() < PORTRAIT_BREAKPOINT);

  readonly stageWidth = computed(() => (this.isPortrait() ? PORTRAIT_WIDTH : STAGE_WIDTH));
  readonly stageHeight = computed(() => (this.isPortrait() ? PORTRAIT_HEIGHT : STAGE_HEIGHT));

  /** `min(vw/stageW, vh/stageH)`, which CSS cannot express: `scale()` needs a bare number. */
  readonly scale = computed(() =>
    Math.min(this._width() / this.stageWidth(), this._height() / this.stageHeight()),
  );

  constructor() {
    globalThis.addEventListener?.('resize', () => {
      this.measure();
    });
    globalThis.addEventListener?.('orientationchange', () => {
      this.measure();
    });
  }

  measure(): void {
    this._width.set(globalThis.innerWidth || STAGE_WIDTH);
    this._height.set(globalThis.innerHeight || STAGE_HEIGHT);
  }

  /** Tests and Playwright's viewport emulation both need to state a size rather than measure one. */
  setSize(width: number, height: number): void {
    this._width.set(width);
    this._height.set(height);
  }
}
