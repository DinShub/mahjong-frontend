/**
 * Per-seat redaction.
 *
 * Spec: `docs/03-domain-model.md` §6.
 *
 * Every event passes through here before it leaves the server. The rule the whole design rests on:
 * **a viewer's projection contains no concealed tile belonging to anyone else.** The property test
 * in `project.spec.ts` asserts exactly that over random games, because a leak here is invisible in
 * normal play and fatal in ranked play.
 *
 * A `null` viewer is a spectator: same treatment as a player who holds no seat.
 *
 * **[M5 addition] Why this lives in `contracts/` rather than in the engine.** It began in
 * `engine/`, where it was only ever used on the way out of the server. M5's replay viewer needs it
 * on the other side: `GET /replays/:gameId` serves the **unredacted** log of a finished game (once
 * a game is over there is nothing left to hide, and the alternative is shipping five projections of
 * the same log so the seat switcher has something to switch to), and the client redacts it locally
 * to answer *"what did seat 2 see?"*. Re-declaring the rule in the frontend would put the one
 * function that decides what is secret in two places; syncing it means the client redacts with the
 * server's own code, drift-checked by CI like every other contract. It imports nothing but its
 * siblings, so the move costs `contracts/` none of its isolation.
 */

import type { GameEvent, Seat } from './actions.js';
import type { TileStr } from './tiles.js';

/** `null` = spectator. */
export type Viewer = Seat | null;

function redactHands(hands: readonly (TileStr[] | null)[], viewer: Viewer): (TileStr[] | null)[] {
  return hands.map((hand, seat) => (seat === viewer ? (hand === null ? null : [...hand]) : null));
}

/**
 * Redact one event for one viewer.
 *
 * Returns a copy; the caller's event is never mutated, so the same event can be projected for four
 * seats and a spectator without any of them seeing another's edit.
 */
export function project(event: GameEvent, viewer: Viewer): GameEvent {
  switch (event.t) {
    case 'game-start': {
      // The seed is the wall. It is published only at game end, which is what makes the
      // commit-reveal check possible without letting anyone compute the wall mid-game.
      const { seed: _seed, ...rest } = event;
      return { ...rest };
    }

    case 'hand-start':
      return { ...event, hands: redactHands(event.hands, viewer) };

    case 'draw':
      // Only the drawer learns which tile it was; everyone else sees that a tile was taken.
      return event.seat === viewer ? { ...event } : { ...event, tile: null };

    case 'agari':
    case 'ryuukyoku':
      // Hands are public at this point — that is the whole reason the hand ended.
      return { ...event };

    case 'discard':
    case 'call':
    case 'riichi-accepted':
    case 'dora-revealed':
    case 'hand-end':
    case 'game-end':
      return { ...event };
  }
}

/** Project a whole log for one viewer — the shape `game:snapshot` and the replay viewer want. */
export function projectAll(events: readonly GameEvent[], viewer: Viewer): GameEvent[] {
  return events.map((event) => project(event, viewer));
}

/**
 * Every `TileStr` a projected event discloses.
 *
 * Used by the leak property test and by dev assertions. Melds, discards and indicators are public
 * by design, so they are listed too and the test filters to what should have stayed hidden.
 */
export function disclosedTiles(event: GameEvent): TileStr[] {
  switch (event.t) {
    case 'hand-start': {
      const tiles = event.hands.flatMap((hand) => hand ?? []);
      return [...tiles, event.doraIndicator];
    }
    case 'draw':
      return event.tile === null ? [] : [event.tile];
    case 'discard':
      return [event.tile];
    case 'call':
      return [...event.meld.tiles];
    case 'dora-revealed':
      return [event.indicator];
    case 'agari':
      return [
        ...event.winners.flatMap((winner) => [
          ...winner.hand,
          ...winner.melds.flatMap((meld) => meld.tiles),
          winner.winningTile,
        ]),
        ...(event.uraIndicators ?? []),
      ];
    case 'ryuukyoku':
      return event.hands.flatMap((hand) => hand ?? []);
    case 'game-start':
    case 'riichi-accepted':
    case 'hand-end':
    case 'game-end':
      return [];
  }
}

/** Tiles a projected `hand-start` or `draw` reveals about a **specific** seat's concealed hand. */
export function concealedTilesRevealed(event: GameEvent, seat: Seat): TileStr[] {
  switch (event.t) {
    case 'hand-start':
      return event.hands[seat] ?? [];
    case 'draw':
      return event.seat === seat && event.tile !== null ? [event.tile] : [];
    default:
      return [];
  }
}
