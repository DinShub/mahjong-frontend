import { describe, expect, it } from 'vitest';

import type { Action } from '@contracts/actions';
import type { Prompt } from '@contracts/views';

import { loadAllFixtures, promptsOf } from '../state/fixtures';
import { ACTION_KINDS, actionSlots, discardTiles, riichiTiles, variantTiles } from './action-slots';

function promptOf(options: Action[]): Prompt {
  return { promptId: 'p', seat: 0, options, deadline: 0, bankRemaining: 20 };
}

/** Two actions with the same key are the same choice — the server's `wireActionKey`, restated. */
function key(action: Action): string {
  switch (action.type) {
    case 'discard':
      return `discard:${action.tile}:${action.riichi === true ? 'r' : ''}`;
    case 'chi':
    case 'pon':
      return `${action.type}:${[...action.tiles].sort().join(',')}`;
    case 'shouminkan':
      return `shouminkan:${action.tile}`;
    case 'ankan':
      return `ankan:${String(action.kind)}`;
    default:
      return action.type;
  }
}

/**
 * `docs/07-frontend.md` §3: the action bar renders **exactly** the options in `prompt.options` and
 * nothing else, ever. There is no client-side "can I pon?", so the only thing to test is that the
 * mapping neither invents a button nor drops one.
 */
describe('actionSlots', () => {
  it('always returns every slot, so nothing moves between prompts', () => {
    for (const prompt of [null, promptOf([]), promptOf([{ type: 'pass' }])]) {
      expect(actionSlots(prompt).map((slot) => slot.kind)).toEqual(ACTION_KINDS);
    }
  });

  it('fills only the slots the prompt offered', () => {
    const slots = actionSlots(promptOf([{ type: 'pon', tiles: ['1m', '1m'] }, { type: 'pass' }]));
    const filled = slots.filter((slot) => slot.options.length > 0).map((slot) => slot.kind);
    expect(filled).toEqual(['pon', 'pass']);
  });

  it('collects all three kan forms under one button', () => {
    const slots = actionSlots(
      promptOf([
        { type: 'ankan', kind: 4 },
        { type: 'shouminkan', tile: '3p' },
      ]),
    );
    const kan = slots.find((slot) => slot.kind === 'kan');
    expect(kan?.options).toHaveLength(2);
  });

  it('treats a riichi discard as the Riichi button, not a discard', () => {
    const slots = actionSlots(
      promptOf([
        { type: 'discard', tile: '1m' },
        { type: 'discard', tile: '9p', riichi: true },
      ]),
    );
    expect(slots.find((slot) => slot.kind === 'riichi')?.options).toHaveLength(1);
    // …and an ordinary discard is not a button at all: it is the hand.
    expect(
      slots.every((slot) =>
        slot.options.every((option) => option.type !== 'discard' || option.riichi === true),
      ),
    ).toBe(true);
  });

  it('separates the two tile lists the hand needs', () => {
    const prompt = promptOf([
      { type: 'discard', tile: '1m' },
      { type: 'discard', tile: '2m' },
      { type: 'discard', tile: '9p', riichi: true },
    ]);
    expect(discardTiles(prompt)).toEqual(['1m', '2m']);
    expect(riichiTiles(prompt)).toEqual(['9p']);
  });

  it('shows the tiles a call variant is made of', () => {
    expect(variantTiles({ type: 'chi', tiles: ['3m', '4m'] })).toEqual(['3m', '4m']);
    expect(variantTiles({ type: 'shouminkan', tile: '3p' })).toEqual(['3p']);
    expect(variantTiles({ type: 'ron' })).toEqual([]);
  });

  it('makes every option of every prompt in every recorded game reachable, and invents none', () => {
    let seen = 0;
    for (const fixture of loadAllFixtures()) {
      for (const step of promptsOf(fixture)) {
        const prompt = promptOf(step.options);

        // Everything the player can actually reach: a button, or a tile in the hand. A riichi
        // discard is both — the button opens the mode, the tile is what it selects — so this is
        // a set comparison rather than a count.
        const reachable = new Set<string>();
        for (const slot of actionSlots(prompt))
          for (const option of slot.options) {
            reachable.add(key(option));
          }
        for (const tile of discardTiles(prompt)) reachable.add(key({ type: 'discard', tile }));
        for (const tile of riichiTiles(prompt)) {
          reachable.add(key({ type: 'discard', tile, riichi: true }));
        }

        expect([...reachable].sort()).toEqual([...new Set(step.options.map(key))].sort());
        seen += step.options.length;
      }
    }
    expect(seen).toBeGreaterThan(100);
  });
});
