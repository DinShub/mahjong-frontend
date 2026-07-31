import { DEAD_WALL_SIZE, TILE_COUNT, tileIdToStr } from '@contracts/tiles';
import type { TileId, TileStr } from '@contracts/tiles';
import type { GameEvent, Seat } from '@contracts/actions';
import type { ReplayLog } from '@contracts/stats';

/**
 * Independent verification of a published wall.
 *
 * `docs/11-nonfunctional.md` §1: the server publishes `sha256(seed)` when a game starts and the
 * seed itself when it ends, so anyone can check afterwards that the wall was fixed before the first
 * discard rather than chosen to suit someone. `tasks/backlog.md` M5 makes that a button.
 *
 * **This is a second implementation of the server's PRNG, and that is the point.** Everywhere else
 * in this project a second implementation is the thing to avoid — the client folds events rather
 * than deciding anything, and `project()` is synced rather than re-declared. Commit-reveal is the
 * exception, and it inverts the argument: a verifier that shared code with the thing it verifies
 * would confirm only that the code is self-consistent. `backend/src/engine/rng.ts` says so itself
 * — *"a verifier reimplementing this in another language has one obvious choice to make and it is
 * the one we made"*. The specification being reimplemented is:
 *
 * - `seedState`: SHA-256 of the seed, read as four big-endian 64-bit words, in digest order.
 * - `Xoshiro256ss.next`: xoshiro256\*\*, all arithmetic masked to 64 bits.
 * - `nextBelow`: rejection sampling, never modulo, so the shuffle is provably uniform.
 * - `shuffle`: Fisher–Yates **descending**, `i` from `n-1` to `1`, swapping with `nextBelow(i + 1)`.
 * - `buildWall`: shuffle the ids `0…135` with the stream for `` `${seed}:${handIndex}` ``.
 * - `dealHands`: three rounds of four tiles per player, then one each, in offset order from the
 *   dealer.
 *
 * `BigInt` throughout for the same reason the server uses it: `Number` loses the low bits of a
 * 64-bit multiply, and a verifier that is right on one platform and wrong on another verifies
 * nothing.
 */

const MASK64 = (1n << 64n) - 1n;

function rotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

class Xoshiro256ss {
  private s0: bigint;
  private s1: bigint;
  private s2: bigint;
  private s3: bigint;

  constructor(state: readonly [bigint, bigint, bigint, bigint]) {
    this.s0 = state[0] & MASK64;
    this.s1 = state[1] & MASK64;
    this.s2 = state[2] & MASK64;
    this.s3 = state[3] & MASK64;
  }

  next(): bigint {
    const result = (rotl((this.s1 * 5n) & MASK64, 7n) * 9n) & MASK64;
    const t = (this.s1 << 17n) & MASK64;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 45n);
    return result;
  }

  nextBelow(bound: number): number {
    const n = BigInt(bound);
    const limit = ((1n << 64n) / n) * n;
    for (;;) {
      const value = this.next();
      if (value < limit) return Number(value % n);
    }
  }
}

/** SHA-256, hex. `crypto.subtle` is async, which is why every entry point here is too. */
async function sha256(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return new Uint8Array(digest);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stateFrom(digest: Uint8Array): [bigint, bigint, bigint, bigint] {
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  return [
    view.getBigUint64(0, false),
    view.getBigUint64(8, false),
    view.getBigUint64(16, false),
    view.getBigUint64(24, false),
  ];
}

function shuffle(items: readonly TileId[], rng: Xoshiro256ss): TileId[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextBelow(i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** The 136 tile ids for one hand, in wall order. */
export async function buildWall(seed: string, handIndex: number): Promise<TileId[]> {
  const digest = await sha256(`${seed}:${String(handIndex)}`);
  const ids = Array.from({ length: TILE_COUNT }, (_unused, index) => index);
  return shuffle(ids, new Xoshiro256ss(stateFrom(digest)));
}

/** The 13-tile starting hands, by absolute seat. */
export function dealToSeats(wall: readonly TileId[], dealer: Seat): [
  TileId[],
  TileId[],
  TileId[],
  TileId[],
] {
  const byOffset: TileId[][] = [[], [], [], []];
  let index = 0;
  for (let round = 0; round < 3; round++) {
    for (let offset = 0; offset < 4; offset++) {
      for (let n = 0; n < 4; n++) byOffset[offset]!.push(wall[index++]!);
    }
  }
  for (let offset = 0; offset < 4; offset++) byOffset[offset]!.push(wall[index++]!);

  const bySeat: TileId[][] = [[], [], [], []];
  for (let offset = 0; offset < 4; offset++) {
    bySeat[(dealer + offset) % 4] = byOffset[offset]!;
  }
  return bySeat as [TileId[], TileId[], TileId[], TileId[]];
}

/** The first dora indicator: dead wall slot 126, i.e. four rinshan tiles past its start. */
export function doraIndicatorOf(wall: readonly TileId[]): TileId {
  return wall[TILE_COUNT - DEAD_WALL_SIZE + 4]!;
}

export interface HandVerification {
  handIndex: number;
  /** `false` when the re-derived deal differs from what the log says was dealt. */
  matches: boolean;
}

export type SeedVerdict =
  | { status: 'ok'; hands: HandVerification[] }
  | { status: 'hash-mismatch'; computed: string; published: string }
  | { status: 'deal-mismatch'; hands: HandVerification[] }
  | { status: 'unverifiable'; reason: string };

function sortedStrs(ids: readonly TileId[]): string {
  return [...ids].map(tileIdToStr).sort().join(',');
}

function sortedTiles(tiles: readonly TileStr[]): string {
  return [...tiles].sort().join(',');
}

/**
 * Re-derive every hand of a replay from its seed and check it against the log.
 *
 * Two independent claims are checked, and both have to hold:
 *
 * 1. **The seed is the one that was committed to.** `sha256(seed)` must equal the `seedHash` the
 *    server published at `game-start`, before any tile was dealt. Without this the seed is just a
 *    number the server made up afterwards.
 * 2. **The wall follows from the seed.** Each hand's `hand-start` lists what was dealt; re-running
 *    the shuffle must produce the same thirteen tiles per seat.
 *
 * Comparison is by *kind*, sorted — the log gives tiles as `TileStr` (`5m`, `0m` for a red five)
 * and the wall gives ids, so `tileIdToStr` is the common ground. Order within a starting hand is
 * not information: a client sorts it before it is ever seen.
 */
export async function verifyReplay(log: ReplayLog): Promise<SeedVerdict> {
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    return { status: 'unverifiable', reason: 'this browser has no Web Crypto' };
  }

  const computed = toHex(await sha256(log.seed));
  if (computed !== log.seedHash) {
    return { status: 'hash-mismatch', computed, published: log.seedHash };
  }

  const starts = log.events.filter(
    (event): event is Extract<GameEvent, { t: 'hand-start' }> => event.t === 'hand-start',
  );
  if (starts.length === 0) {
    return { status: 'unverifiable', reason: 'the log contains no dealt hand' };
  }

  const hands: HandVerification[] = [];
  for (const start of starts) {
    const wall = await buildWall(log.seed, start.handIndex);
    const dealt = dealToSeats(wall, start.dealer);
    const matches = dealt.every((seatTiles, seat) => {
      const logged = start.hands[seat];
      // A projected log would have `null` here. The replay endpoint serves unredacted logs, so a
      // null is a log this client cannot check rather than a failed check.
      return logged == null ? true : sortedStrs(seatTiles) === sortedTiles(logged);
    });
    hands.push({ handIndex: start.handIndex, matches });
  }

  return hands.every((hand) => hand.matches)
    ? { status: 'ok', hands }
    : { status: 'deal-mismatch', hands };
}
