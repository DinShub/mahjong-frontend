import { describe, expect, it } from 'vitest';

import type { MeldWire, Seat } from '@contracts/actions';
import { compareTileStr } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';
import type { PlayerView, PlayerViewSeat } from '@contracts/views';

import { applyEvent, tilesFromHand } from './apply-event';
import { eventsOf, loadAllFixtures, loadFixture } from './fixtures';

/**
 * The client's event fold, checked against the engine's own state.
 *
 * Every fixture is a real hand the M2 soak found, replayed through the engine that passes the
 * 12 009-hand conformance gate, and published as: the view a client joins on, the projected
 * events, and **the view the engine held after the last action**. Folding the events onto the
 * snapshot has to land on that view.
 *
 * This is the reason the fixtures are generated rather than written. A hand-authored expectation
 * asserts what the author believed; this asserts what the server actually had — through a
 * suukaikan, a triple ron and a nagashi mangan, which no-one would think to write down.
 */

/** The part of a view the client is responsible for reproducing from events. */
interface Comparable {
  round: number;
  kyoku: number;
  honba: number;
  riichiSticks: number;
  dealer: Seat;
  scores: number[];
  wallRemaining: number;
  doraIndicators: TileStr[];
  phase: string;
  turn: Seat;
  seats: {
    seat: Seat;
    handSize: number;
    hand: TileStr[] | null;
    drawn: TileStr | null;
    melds: MeldWire[];
    discards: {
      tile: TileStr;
      tsumogiri: boolean;
      riichiDeclaration: boolean;
      calledBy: Seat | null;
    }[];
    inRiichi: boolean;
    isTenpaiRevealed: boolean;
  }[];
}

/**
 * The engine advances round, kyoku, honba and the dealer as part of *finishing* a hand, before it
 * emits `hand-end` — and `hand-end` carries only two of the four. The client is therefore one hand
 * behind on all four between `hand-end` and the `hand-start` that restates them, deliberately and
 * consistently (see the `hand-end` case in `apply-event.ts`), so they are not compared at a state
 * whose whole content is "the hand is over". Everything the reducer actually does — hands, melds,
 * ponds, scores, dora, the wall, the stick count — is compared in every fixture, and the four
 * counters have their own test below.
 */
const SETTLED = new Set(['hand-end', 'game-end']);

function comparable(view: PlayerView): Comparable {
  const settled = SETTLED.has(view.phase);
  return {
    round: settled ? -1 : view.round,
    kyoku: settled ? -1 : view.kyoku,
    honba: settled ? -1 : view.honba,
    riichiSticks: view.riichiSticks,
    dealer: settled ? (0 as Seat) : view.dealer,
    scores: [...view.scores],
    wallRemaining: view.wallRemaining,
    doraIndicators: [...view.doraIndicators],
    phase: view.phase,
    turn: view.turn,
    seats: view.players.map((seat: PlayerViewSeat) => ({
      seat: seat.seat,
      handSize: seat.handSize,
      // Sorted: the engine keeps draw order and the client keeps arrival order, and neither is
      // shown to anyone — the hand component sorts for display.
      hand: seat.hand === null ? null : [...seat.hand].sort(compareTileStr),
      drawn: seat.drawn,
      melds: seat.melds,
      discards: seat.discards,
      // `riichi.declaredOnTurn` is the engine's turn counter, which the client has no event for
      // and never renders; whether a seat is *in* riichi is what the board draws.
      inRiichi: seat.riichi !== null,
      isTenpaiRevealed: seat.isTenpaiRevealed,
    })),
  };
}

function fold(fixture: ReturnType<typeof loadFixture>): PlayerView {
  let view: PlayerView | null = fixture.snapshot;
  for (const step of eventsOf(fixture)) {
    view = applyEvent(view, step.event, {
      tableId: fixture.snapshot.tableId,
      mySeat: fixture.mySeat,
    });
    expect(view, `event ${step.event.t} produced no view`).not.toBeNull();
  }
  return view!;
}

describe('applyEvent over recorded games', () => {
  const fixtures = loadAllFixtures();

  it('has fixtures to run', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    describe(fixture.situation, () => {
      it('folds to the state the engine held', () => {
        expect(comparable(fold(fixture))).toEqual(comparable(fixture.final));
      });

      it('never loses or invents a tile', () => {
        const view = fold(fixture);
        for (const seat of view.players) {
          if (seat.hand !== null) {
            expect(seat.hand.length + (seat.drawn === null ? 0 : 1)).toBe(seat.handSize);
          }
          // Concealed = 13 − 3 per meld, plus one while a tile is drawn. A kan's fourth tile is
          // the *extra* one that makes the hand 14 physical tiles, so it cancels out and every
          // meld — chi, pon or kan — costs exactly three. This is also what makes
          // `handSize % 3 === 2` a sound test for "this seat is holding a drawn tile".
          const melds = seat.melds.length;
          expect([13 - 3 * melds, 14 - 3 * melds]).toContain(seat.handSize);
        }
      });

      it('keeps every called discard in its pond slot', () => {
        const view = fold(fixture);
        for (const seat of view.players) {
          const called = seat.discards.filter((discard) => discard.calledBy !== null);
          // One marked discard per meld taken off this seat — including a pon that has since
          // grown into a shouminkan, which still points at the discard the pon consumed.
          const taken = view.players.flatMap((player) =>
            player.melds.filter((meld) => meld.from === seat.seat),
          );
          expect(called.length).toBe(taken.length);
        }
      });
    });
  }
});

describe('applyEvent', () => {
  const base = loadFixture('chankan');

  it('returns null when there is nothing to apply to', () => {
    const [first] = eventsOf(base);
    expect(applyEvent(null, first!.event, { tableId: 't', mySeat: 0 })).toBeNull();
  });

  it('builds a view from game-start alone', () => {
    const view = applyEvent(
      null,
      {
        t: 'game-start',
        config: base.snapshot.config,
        players: base.snapshot.players.map((seat) => seat.player),
        seedHash: 'abc',
      },
      { tableId: 'table-1', mySeat: 2 },
    );
    expect(view).not.toBeNull();
    expect(view?.mySeat).toBe(2);
    expect(view?.tableId).toBe('table-1');
    expect(view?.scores).toEqual([25_000, 25_000, 25_000, 25_000]);
  });

  it('takes round, kyoku, honba, dealer and scores from hand-start', () => {
    const view = applyEvent(
      base.snapshot,
      {
        t: 'hand-start',
        handIndex: 7,
        round: 1,
        kyoku: 3,
        honba: 2,
        riichiSticks: 1,
        dealer: 2,
        scores: [30_000, 20_000, 25_000, 25_000],
        hands: [null, null, ['1m', '2m'] as TileStr[], null],
        doraIndicator: '3p',
      },
      { tableId: 't', mySeat: 2 },
    );

    expect(view?.round).toBe(1);
    expect(view?.kyoku).toBe(3);
    expect(view?.honba).toBe(2);
    expect(view?.riichiSticks).toBe(1);
    expect(view?.dealer).toBe(2);
    expect(view?.turn).toBe(2);
    expect(view?.scores).toEqual([30_000, 20_000, 25_000, 25_000]);
    expect(view?.doraIndicators).toEqual(['3p']);
    expect(view?.wallRemaining).toBe(70);
    // Every seat starts the hand clean: no melds, no pond, no riichi, thirteen tiles.
    for (const seat of view?.players ?? []) {
      expect(seat.handSize).toBe(13);
      expect(seat.melds).toEqual([]);
      expect(seat.discards).toEqual([]);
      expect(seat.riichi).toBeNull();
      expect(seat.drawn).toBeNull();
    }
    expect(view?.players[2]?.hand).toEqual(['1m', '2m']);
    expect(view?.players[0]?.hand).toBeNull();
  });

  it('counts the tiles a call takes out of the hand', () => {
    const meld = (type: MeldWire['type'], count: number): MeldWire => ({
      type,
      tiles: Array.from({ length: count }, () => '1m' as TileStr),
      calledTile: type === 'ankan' ? null : '1m',
      from: type === 'ankan' ? null : 1,
      calledIndex: type === 'ankan' ? null : 0,
    });
    expect(tilesFromHand(meld('chi', 3))).toBe(2);
    expect(tilesFromHand(meld('pon', 3))).toBe(2);
    expect(tilesFromHand(meld('daiminkan', 4))).toBe(3);
    expect(tilesFromHand(meld('ankan', 4))).toBe(4);
    // A shouminkan spends one: the other three went on the pon it extends.
    expect(tilesFromHand(meld('shouminkan', 4))).toBe(1);
  });
});
