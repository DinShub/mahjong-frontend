import { Injectable, inject } from '@angular/core';

import { SettingsService } from '@core/settings/settings.service';

/**
 * The motion table of `docs/08-graphics-ux.md` §4, as data.
 *
 * All of it runs on the Web Animations API rather than CSS transitions, for the reason that
 * section gives: *"an interrupted CSS transition on a re-render produces the wrong final
 * position; explicit animations can be cancelled and finished deterministically."* An `Animation`
 * object can be told to `finish()`, and the event queue does exactly that when it catches up.
 */
export type MotionName =
  'draw' | 'discard' | 'tsumogiri' | 'call' | 'riichi' | 'dora' | 'agari' | 'score' | 'overlay';

export interface Motion {
  keyframes: Keyframe[];
  duration: number;
  easing: string;
}

const ARC_OUT = 'cubic-bezier(0.22, 0.9, 0.28, 1)';

export const MOTIONS: Readonly<Record<MotionName, Motion>> = {
  // The tile arrives at the hand's right edge from the wall.
  draw: {
    keyframes: [
      { transform: 'translate(26px, -14px) scale(0.94)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    duration: 140,
    easing: ARC_OUT,
  },
  // Into the pond from the direction of its owner's hand, with the slight rotation of a real throw.
  discard: {
    keyframes: [
      { transform: 'translateY(-52px) rotate(-8deg) scale(1.04)', opacity: 0.2 },
      { transform: 'none', opacity: 1 },
    ],
    duration: 180,
    easing: ARC_OUT,
  },
  tsumogiri: {
    keyframes: [
      { transform: 'translate(28px, -52px) rotate(6deg)', opacity: 0.2 },
      { transform: 'none', opacity: 1 },
    ],
    duration: 180,
    easing: ARC_OUT,
  },
  // The meld assembles: it comes in from the pond side and settles.
  call: {
    keyframes: [
      { transform: 'translateX(-70px) scale(0.9)', opacity: 0 },
      { transform: 'translateX(6px) scale(1.02)', opacity: 1, offset: 0.7 },
      { transform: 'none', opacity: 1 },
    ],
    duration: 320,
    easing: ARC_OUT,
  },
  riichi: {
    keyframes: [
      { transform: 'translateY(-40px) rotate(0deg)', opacity: 0 },
      { transform: 'translateY(-8px) rotate(90deg)', opacity: 1, offset: 0.6 },
      { transform: 'none' },
    ],
    duration: 500,
    easing: ARC_OUT,
  },
  // The indicator flips face-up on its Y axis.
  dora: {
    keyframes: [
      { transform: 'perspective(320px) rotateY(90deg)', opacity: 0.4 },
      { transform: 'perspective(320px) rotateY(0deg)', opacity: 1 },
    ],
    duration: 400,
    easing: 'ease-out',
  },
  agari: {
    keyframes: [
      { transform: 'translateY(38px) scale(0.97)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    duration: 1200,
    easing: ARC_OUT,
  },
  score: {
    keyframes: [
      { transform: 'translateY(8px)', opacity: 0 },
      { transform: 'translateY(-10px)', opacity: 1, offset: 0.3 },
      { transform: 'translateY(-18px)', opacity: 0 },
    ],
    duration: 600,
    easing: 'ease-out',
  },
  overlay: {
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
    duration: 180,
    easing: 'ease-out',
  },
};

@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly settings = inject(SettingsService);

  /** True when animation should be skipped entirely — the state still applies, instantly. */
  get reduced(): boolean {
    return this.settings.reducedMotion();
  }

  /**
   * Play one of the named motions. Returns the `Animation` so a caller can `finish()` it — which
   * is what the catch-up path does, and the reason none of this is a CSS transition.
   */
  play(
    element: Element,
    name: MotionName,
    overrides: KeyframeAnimationOptions = {},
  ): Animation | null {
    if (this.reduced) return null;
    const motion = MOTIONS[name];
    const target = element as Element & {
      animate?: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => Animation;
    };
    // jsdom has no Web Animations API; a component test asserts state, not tweens.
    if (typeof target.animate !== 'function') return null;
    return target.animate(motion.keyframes, {
      duration: motion.duration,
      easing: motion.easing,
      fill: 'none',
      ...overrides,
    });
  }
}
