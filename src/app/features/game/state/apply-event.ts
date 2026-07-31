import { SEATS } from '@contracts/actions';
import type { CallEvent, GameEvent, MeldWire, Seat } from '@contracts/actions';
import { tileStrToKind } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';
import { LIVE_WALL_DRAWS } from '@contracts/tiles';
import type { PlayerView, PlayerViewSeat } from '@contracts/views';

/**
 * Folding events into the view the board renders.
 *
 * **This is not a second engine.** M1 and M3 both refused to build one server-side, for the same
 * reason each time: a second state machine has to be held to the same 12 009-hand conformance gate
 * as the first, and diverges the day someone fixes a bug in only one. Nothing here is at risk of
 * that, because nothing here decides anything. It moves tiles between a hand, a pond and a meld,
 * and copies scores out of the event that carries them. Every judgement — what is legal, what a
 * hand is worth, who won — arrives already made (`docs/07-frontend.md` §1).
 *
 * The client needs it anyway: the server sends a full `PlayerView` on join, reconnect and resync,
 * and events for everything in between. Asking for a snapshot after each event would be a round
 * trip per tile.
 *
 * Every function returns a new object. Signals and `OnPush` both compare by reference.
 */

/** Live-wall draws at the start of a hand, before the dealer's 14th tile. */
const FULL_WALL = LIVE_WALL_DRAWS;

function removeOne(tiles: readonly TileStr[], tile: TileStr): TileStr[] | null {
  const index = tiles.indexOf(tile);
  if (index === -1) return null;
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}

/**
 * Remove `tile`, falling back to any copy of the same *kind*.
 *
 * The fallback exists for red fives: `0p` and `5p` are the same kind and the server may have
 * resolved a call to the red copy while this client's hand still lists the ordinary one — which
 * can happen for a fraction of a second around a resync. Dropping the wrong copy renders a red
 * five as a plain one until the next snapshot; dropping nothing corrupts the hand size for the
 * rest of the game.
 */
function removeMatching(tiles: readonly TileStr[], tile: TileStr): TileStr[] {
  const exact = removeOne(tiles, tile);
  if (exact !== null) return exact;
  const kind = tileStrToKind(tile);
  const index = tiles.findIndex((candidate) => tileStrToKind(candidate) === kind);
  return index === -1 ? [...tiles] : [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}

function removeAll(tiles: readonly TileStr[], remove: readonly TileStr[]): TileStr[] {
  return remove.reduce<TileStr[]>((rest, tile) => removeMatching(rest, tile), [...tiles]);
}

function sameKind(a: TileStr, b: TileStr): boolean {
  return tileStrToKind(a) === tileStrToKind(b);
}

function patchSeat(
  view: PlayerView,
  seat: Seat,
  patch: (current: PlayerViewSeat) => PlayerViewSeat,
): PlayerView {
  return {
    ...view,
    players: view.players.map((player) => (player.seat === seat ? patch(player) : player)),
  };
}

// ---------------------------------------------------------------------------
// Melds
// ---------------------------------------------------------------------------

/** How many tiles a call takes out of the caller's concealed hand. */
export function tilesFromHand(meld: MeldWire): number {
  switch (meld.type) {
    case 'chi':
    case 'pon':
      return 2;
    case 'daiminkan':
      return 3;
    case 'ankan':
      return 4;
    case 'shouminkan':
      // The other three were already spent on the pon this extends.
      return 1;
  }
}

/** The tiles a call takes out of the hand — everything in the meld except the called copy. */
function handTilesOf(meld: MeldWire, previous: MeldWire | null): TileStr[] {
  if (meld.type === 'shouminkan') {
    if (previous === null) return [meld.tiles[meld.tiles.length - 1] ?? meld.tiles[0]!];
    // Exactly one tile of the kan is not in the pon it extends: the one just added.
    const added = removeAll(meld.tiles, previous.tiles);
    return added.length > 0 ? added : [meld.tiles[0]!];
  }
  if (meld.type === 'ankan') return [...meld.tiles];
  return meld.tiles.filter((_tile, index) => index !== meld.calledIndex);
}

/** The pon a shouminkan extends, if this client is holding one that matches. */
function ponToExtend(melds: readonly MeldWire[], meld: MeldWire): number {
  if (meld.type !== 'shouminkan') return -1;
  const kind = meld.tiles[0];
  if (kind === undefined) return -1;
  return melds.findIndex(
    (existing) => existing.type === 'pon' && existing.tiles.some((tile) => sameKind(tile, kind)),
  );
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

export interface ApplyContext {
  tableId: string;
  /** `null` = spectator. Decides which hand is populated when a hand starts. */
  mySeat: Seat | null;
}

/**
 * Apply one event. `null` in means "no view yet" — only `game-start` can produce one, which is
 * what a replay does when it opens a log with no snapshot in front of it.
 */
export function applyEvent(
  view: PlayerView | null,
  event: GameEvent,
  context: ApplyContext,
): PlayerView | null {
  if (event.t === 'game-start') return viewFromGameStart(event, context);
  if (view === null) return null;

  switch (event.t) {
    case 'hand-start': {
      const next: PlayerView = {
        ...view,
        round: event.round,
        kyoku: event.kyoku,
        honba: event.honba,
        riichiSticks: event.riichiSticks,
        dealer: event.dealer,
        scores: [...event.scores],
        wallRemaining: FULL_WALL,
        doraIndicators: [event.doraIndicator],
        phase: 'awaiting-draw',
        turn: event.dealer,
        pendingPrompt: null,
        players: view.players.map((player) => ({
          ...player,
          // A `null` entry is another seat's hand; the count is public even when the tiles are not.
          hand: event.hands[player.seat] ?? null,
          handSize: 13,
          drawn: null,
          melds: [],
          discards: [],
          riichi: null,
          isTenpaiRevealed: false,
        })),
      };
      return next;
    }

    case 'draw': {
      const next = patchSeat(view, event.seat, (player) => ({
        ...player,
        handSize: player.handSize + 1,
        drawn: event.tile,
      }));
      return { ...next, turn: event.seat, wallRemaining: event.wallRemaining };
    }

    case 'discard': {
      const next = patchSeat(view, event.seat, (player) => {
        const hand = player.hand;
        const drawn = player.drawn;
        let remaining = hand;
        if (hand !== null) {
          if (event.tsumogiri && drawn !== null) {
            remaining = hand;
          } else {
            // The drawn tile joins the hand as the discarded one leaves it.
            const withDrawn = drawn === null ? hand : [...hand, drawn];
            remaining = removeMatching(withDrawn, event.tile);
          }
        }
        return {
          ...player,
          hand: remaining,
          drawn: null,
          handSize: player.handSize - 1,
          discards: [
            ...player.discards,
            {
              tile: event.tile,
              tsumogiri: event.tsumogiri,
              riichiDeclaration: event.riichi,
              calledBy: null,
            },
          ],
        };
      });
      return { ...next, turn: event.seat };
    }

    case 'call':
      return applyCall(view, event);

    case 'riichi-accepted': {
      const next = patchSeat(view, event.seat, (player) => ({
        ...player,
        riichi: {
          // The event carries no turn counter; the declaring discard is the seat's latest, and
          // this field only ever drives display ("declared on their 6th discard").
          declaredOnTurn: Math.max(0, player.discards.length - 1),
          ippatsu: true,
        },
      }));
      return { ...next, riichiSticks: event.sticks, scores: [...event.scores] };
    }

    case 'dora-revealed':
      return { ...view, doraIndicators: [...view.doraIndicators, event.indicator] };

    case 'agari':
      // The winners' hands travel *in the event*, and the overlay reads them from there. They are
      // deliberately not written into the view: the server does not reveal them there either
      // (`isTenpaiRevealed` is an exhaustive-draw thing), and a view that disagreed with the
      // server's own would show through the moment a snapshot arrived.
      return { ...view, scores: [...event.scores], phase: 'hand-end', pendingPrompt: null };

    case 'ryuukyoku':
      return {
        ...view,
        scores: [...event.scores],
        phase: 'hand-end',
        pendingPrompt: null,
        players: view.players.map((player) => ({
          ...player,
          hand: event.hands[player.seat] ?? player.hand,
          isTenpaiRevealed: event.reason === 'exhaustive' && event.tenpai[player.seat] === true,
        })),
      };

    case 'hand-end':
      // `nextDealer` and `nextHonba` describe the hand *after* this one, and the event does not
      // say what its kyoku or round will be. Applying two of the three would put a dealer that
      // belongs to East 4 on a board still labelled East 3, so the board keeps showing the hand
      // that just finished — which is also what the overlay in front of it is describing — and
      // the `hand-start` that follows sets round, kyoku, honba, dealer and scores together, from
      // the server. The one value here that is about *this* moment is the stick count.
      return { ...view, phase: 'hand-end', riichiSticks: event.riichiSticks };

    case 'game-end':
      return { ...view, phase: 'game-end', pendingPrompt: null };
  }
}

function applyCall(view: PlayerView, event: CallEvent): PlayerView {
  const { meld, seat } = event;

  let next = patchSeat(view, seat, (player) => {
    const extendIndex = ponToExtend(player.melds, meld);
    const previous = extendIndex === -1 ? null : (player.melds[extendIndex] ?? null);
    const melds =
      extendIndex === -1
        ? [...player.melds, meld]
        : player.melds.map((existing, index) => (index === extendIndex ? meld : existing));

    const fromHand = handTilesOf(meld, previous);
    // An ankan or shouminkan happens on the caller's own turn, so the drawn tile is in play and
    // may be one of the tiles going into the meld. Merge it before removing — the drawn tile is
    // *part of* `handSize`, so the only thing the call subtracts is what went into the meld.
    const pool = player.hand === null ? null : mergeDrawn(player.hand, player.drawn);

    return {
      ...player,
      melds,
      hand: pool === null ? null : removeAll(pool, fromHand),
      drawn: null,
      handSize: player.handSize - tilesFromHand(meld),
    };
  });

  // The called tile leaves the discarder's pond but keeps its slot: pond position is information
  // players read, so the gap stays (`docs/08-graphics-ux.md` §2). A shouminkan consumes nothing —
  // its `from` points at the pon it extends, which was marked when the pon was called.
  if (meld.from !== null && meld.type !== 'shouminkan' && meld.calledTile !== null) {
    const called = meld.calledTile;
    next = patchSeat(next, meld.from, (player) => {
      const index = lastUncalledIndexOf(player.discards, called);
      if (index === -1) return player;
      return {
        ...player,
        discards: player.discards.map((discard, at) =>
          at === index ? { ...discard, calledBy: seat } : discard,
        ),
      };
    });
  }

  return { ...next, turn: seat };
}

function mergeDrawn(hand: readonly TileStr[], drawn: TileStr | null): TileStr[] {
  return drawn === null ? [...hand] : [...hand, drawn];
}

function lastUncalledIndexOf(
  discards: readonly { tile: TileStr; calledBy: Seat | null }[],
  tile: TileStr,
): number {
  for (let index = discards.length - 1; index >= 0; index -= 1) {
    const discard = discards[index]!;
    if (discard.calledBy === null && sameKind(discard.tile, tile)) return index;
  }
  return -1;
}

/** The skeleton a `game-start` produces when there is no snapshot to start from. */
export function viewFromGameStart(
  event: Extract<GameEvent, { t: 'game-start' }>,
  context: ApplyContext,
): PlayerView {
  return {
    seq: 0,
    tableId: context.tableId,
    config: event.config,
    round: 0,
    kyoku: 1,
    honba: 0,
    riichiSticks: 0,
    dealer: 0,
    mySeat: context.mySeat,
    scores: SEATS.map(() => event.config.startingPoints),
    wallRemaining: FULL_WALL,
    doraIndicators: [],
    players: SEATS.map((seat) => ({
      seat,
      player: event.players[seat] ?? {
        userId: null,
        displayName: `Seat ${String(seat)}`,
        avatarId: 'bot',
        isBot: true,
        botLevel: 'normal',
      },
      handSize: 13,
      hand: null,
      drawn: null,
      melds: [],
      discards: [],
      riichi: null,
      isTenpaiRevealed: false,
      connection: 'online',
      clockBank: 0,
    })),
    phase: 'waiting',
    turn: 0,
    pendingPrompt: null,
    lastEventSeq: 0,
    // Waits are pushed by the server (`game:waits`), never folded: the client is not allowed to
    // work out whether a wait exists. A view built from `game-start` has not been told yet.
    myWaits: null,
  };
}
