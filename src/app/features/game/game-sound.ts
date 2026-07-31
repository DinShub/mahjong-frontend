import { effect, inject } from '@angular/core';

import type { GameEvent } from '@contracts/actions';

import { SoundService } from '@core/sound/sound.service';

import { GameStore } from './state/game.store';

/**
 * Which sound each event makes.
 *
 * `docs/08-graphics-ux.md` §7 lists five: *"Tile discard click, call announcement, riichi stick
 * drop, win chime, timer warning tick (last 3 s)."* The first four are events; the tick is a clock,
 * and belongs to whatever is counting down rather than to the event stream.
 *
 * A draw gets a quieter sound of its own, which the doc does not list. It is the other half of the
 * discard click — a hand where tiles only ever make a noise on the way out sounds broken — and it
 * is at a third of the volume for the same reason a real table is quieter picking up than putting
 * down.
 */
function soundFor(event: GameEvent): Parameters<SoundService['play']>[0] | null {
  switch (event.t) {
    case 'discard':
      return 'discard';
    case 'draw':
      return 'draw';
    case 'call':
      return 'call';
    case 'riichi-accepted':
      return 'riichi';
    case 'agari':
      return 'win';
    default:
      return null;
  }
}

/**
 * Play the board's sounds, driven by the store's last applied event.
 *
 * A function rather than a service because it has to run inside an injection context that dies
 * with the game screen: an effect registered on a root service would keep firing on a replay's
 * events, or on a second game, long after the screen that wanted it was gone.
 *
 * It follows `lastEvent`, which the store sets as each event *leaves the queue* — so a sound lands
 * with the animation it belongs to rather than when the packet arrived, which is the entire reason
 * the event queue exists (`docs/07-frontend.md` §1).
 */
export function playGameSounds(): void {
  const store = inject(GameStore);
  const sound = inject(SoundService);

  let last: GameEvent | null = null;
  effect(() => {
    const event = store.lastEvent();
    // Identity, not equality: the same event object re-emitted is a re-render, and two identical
    // discards in a row are two different objects.
    if (event === null || event === last) return;
    last = event;
    const name = soundFor(event);
    if (name !== null) sound.play(name);
  });
}
