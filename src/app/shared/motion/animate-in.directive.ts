import { Directive, ElementRef, inject, input } from '@angular/core';
import type { AfterViewInit } from '@angular/core';

import { MotionService } from './motion';
import type { MotionName } from './motion';

/**
 * Play a motion when the element appears.
 *
 * The event queue already paces the game — a discard is applied, then the queue waits 120 ms — so
 * an entrance animation on the element the event created *is* the animation for that event, with
 * no cross-component measurement and no FLIP bookkeeping. The tile arrives from the direction it
 * came from because the keyframes say so.
 *
 * `docs/08-graphics-ux.md` §4: **no animation may delay input.** Nothing here awaits anything; the
 * action bar renders on its own schedule and the animation finishes underneath it.
 */
@Directive({
  selector: '[mjAnimateIn]',
})
export class AnimateInDirective implements AfterViewInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly motion = inject(MotionService);

  readonly mjAnimateIn = input.required<MotionName>();
  readonly mjAnimateDelay = input(0);
  /**
   * Only the element the event *created* should animate. A pond holds every discard of the hand
   * and is re-rendered whenever anything in it changes; without this, a resync would replay
   * fourteen throws at once.
   */
  readonly mjAnimateWhen = input(true);

  ngAfterViewInit(): void {
    if (!this.mjAnimateWhen()) return;
    this.motion.play(this.element.nativeElement, this.mjAnimateIn(), {
      delay: this.mjAnimateDelay(),
    });
  }
}
