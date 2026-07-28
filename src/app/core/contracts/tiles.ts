/**
 * Tile encoding — the canonical representation used by every layer.
 *
 * Spec: `docs/03-domain-model.md` §1.
 *
 * Three representations, deliberately distinct:
 *
 * - `TileKind` (0…33)  — the 34 distinct faces. Analysis form.
 * - `TileId`   (0…135) — a physical copy: `kind * 4 + copy`. Storage/engine form; knows red fives.
 * - `TileStr`  ("5m")  — wire/log/fixture form. The protocol only ever carries this.
 *
 * The engine works in `TileId`, the wire carries `TileStr`. Never mix them in one variable.
 *
 * This module has ZERO dependencies (not even zod) — see `docs/06-backend.md` §1.
 */

/** One of the 34 distinct tile faces, `0…33`. */
export type TileKind = number;

/** One of the 136 physical tiles, `0…135`. `kind = id >> 2`. */
export type TileId = number;

/** Numbered suits. */
export type Suit = 'm' | 'p' | 's';

/** Suit of a kind, where `z` covers winds + dragons. */
export type TileSuit = Suit | 'z';

type Rank1To9 = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type Rank1To7 = '1' | '2' | '3' | '4' | '5' | '6' | '7';

/** `1m`…`9m`, `1p`…`9p`, `1s`…`9s` */
export type SuitedTileStr = `${Rank1To9}${Suit}`;
/** `0m` / `0p` / `0s` — the red five of that suit. */
export type RedTileStr = `0${Suit}`;
/** `1z`…`7z` = E, S, W, N, Haku, Hatsu, Chun. */
export type HonorTileStr = `${Rank1To7}z`;

/** Wire notation for a single tile. 37 possible values. */
export type TileStr = SuitedTileStr | RedTileStr | HonorTileStr;

/** Number of distinct faces. */
export const TILE_KIND_COUNT = 34;
/** Number of physical tiles in a set. */
export const TILE_COUNT = 136;
/** Copies of each kind. */
export const COPIES_PER_KIND = 4;
/** Tiles set aside as the dead wall. */
export const DEAD_WALL_SIZE = 14;
/** Live-wall draws available in a hand: 136 − 14 dead − 13×4 dealt. */
export const LIVE_WALL_DRAWS = 70;
/** Maximum dora indicators (1 initial + 4 kan dora). */
export const MAX_DORA_INDICATORS = 5;

/** First kind of each group. */
export const KIND_MAN_1 = 0;
export const KIND_PIN_1 = 9;
export const KIND_SOU_1 = 18;
export const KIND_EAST = 27;
export const KIND_SOUTH = 28;
export const KIND_WEST = 29;
export const KIND_NORTH = 30;
export const KIND_HAKU = 31;
export const KIND_HATSU = 32;
export const KIND_CHUN = 33;

/** Kinds that have a red copy: 5m, 5p, 5s. */
export const RED_FIVE_KINDS: readonly TileKind[] = [4, 13, 22];

/**
 * The three red fives are fixed physical instances (Tenhou convention):
 * `5m → 16`, `5p → 52`, `5s → 88` — i.e. copy 0 of each five.
 */
export const RED_TILE_IDS: readonly TileId[] = [16, 52, 88];

const RED_TILE_ID_SET: ReadonlySet<TileId> = new Set(RED_TILE_IDS);

/** Every legal `TileStr`, in canonical order (red five last within its suit). */
export const ALL_TILE_STRS = [
  '1m',
  '2m',
  '3m',
  '4m',
  '5m',
  '6m',
  '7m',
  '8m',
  '9m',
  '0m',
  '1p',
  '2p',
  '3p',
  '4p',
  '5p',
  '6p',
  '7p',
  '8p',
  '9p',
  '0p',
  '1s',
  '2s',
  '3s',
  '4s',
  '5s',
  '6s',
  '7s',
  '8s',
  '9s',
  '0s',
  '1z',
  '2z',
  '3z',
  '4z',
  '5z',
  '6z',
  '7z',
] as const satisfies readonly TileStr[];

const TILE_STR_SET: ReadonlySet<string> = new Set<string>(ALL_TILE_STRS);

const SUIT_TO_BASE_KIND: Readonly<Record<TileSuit, TileKind>> = {
  m: KIND_MAN_1,
  p: KIND_PIN_1,
  s: KIND_SOU_1,
  z: KIND_EAST,
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function isTileKind(value: unknown): value is TileKind {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TILE_KIND_COUNT
  );
}

export function isTileId(value: unknown): value is TileId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TILE_COUNT;
}

export function isTileStr(value: unknown): value is TileStr {
  return typeof value === 'string' && TILE_STR_SET.has(value);
}

function requireTileId(id: TileId): TileId {
  if (!isTileId(id)) throw new RangeError(`Not a TileId: ${String(id)}`);
  return id;
}

function requireTileKind(kind: TileKind): TileKind {
  if (!isTileKind(kind)) throw new RangeError(`Not a TileKind: ${String(kind)}`);
  return kind;
}

// ---------------------------------------------------------------------------
// Kind / id arithmetic
// ---------------------------------------------------------------------------

/** The face of a physical tile. */
export function kindOf(id: TileId): TileKind {
  return requireTileId(id) >> 2;
}

/** Which of the 4 copies (`0…3`) a physical tile is. */
export function copyOf(id: TileId): number {
  return requireTileId(id) & 3;
}

/** The physical tile for `kind`'s `copy`-th instance. */
export function tileIdOf(kind: TileKind, copy: number): TileId {
  requireTileKind(kind);
  if (!Number.isInteger(copy) || copy < 0 || copy >= COPIES_PER_KIND) {
    throw new RangeError(`Not a copy index: ${String(copy)}`);
  }
  return kind * COPIES_PER_KIND + copy;
}

export function isRedTileId(id: TileId): boolean {
  return RED_TILE_ID_SET.has(requireTileId(id));
}

export function isRedTileStr(value: TileStr): boolean {
  return value.charCodeAt(0) === 48; /* '0' */
}

export function isHonorKind(kind: TileKind): boolean {
  return requireTileKind(kind) >= KIND_EAST;
}

export function isTerminalKind(kind: TileKind): boolean {
  return requireTileKind(kind) < KIND_EAST && (kind % 9 === 0 || kind % 9 === 8);
}

/** Terminal **or** honor — the 13 kinds used by kokushi / chanta / junchan / honroutou. */
export function isYaochuuKind(kind: TileKind): boolean {
  return isHonorKind(kind) || isTerminalKind(kind);
}

export function isSimpleKind(kind: TileKind): boolean {
  return !isYaochuuKind(kind);
}

export function isWindKind(kind: TileKind): boolean {
  return requireTileKind(kind) >= KIND_EAST && kind <= KIND_NORTH;
}

export function isDragonKind(kind: TileKind): boolean {
  return requireTileKind(kind) >= KIND_HAKU;
}

/** `m` | `p` | `s` | `z`. */
export function suitOfKind(kind: TileKind): TileSuit {
  requireTileKind(kind);
  if (kind >= KIND_EAST) return 'z';
  if (kind >= KIND_SOU_1) return 's';
  if (kind >= KIND_PIN_1) return 'p';
  return 'm';
}

/** `1…9` for numbered suits, `1…7` for honors (E S W N Haku Hatsu Chun). */
export function rankOfKind(kind: TileKind): number {
  requireTileKind(kind);
  return kind < KIND_EAST ? (kind % 9) + 1 : kind - KIND_EAST + 1;
}

/** Inverse of {@link suitOfKind} + {@link rankOfKind}. */
export function kindOfSuitRank(suit: TileSuit, rank: number): TileKind {
  const max = suit === 'z' ? 7 : 9;
  if (!Number.isInteger(rank) || rank < 1 || rank > max) {
    throw new RangeError(`Not a rank for suit ${suit}: ${String(rank)}`);
  }
  return SUIT_TO_BASE_KIND[suit] + rank - 1;
}

/** The 13 terminal/honor kinds, in kind order. */
export const YAOCHUU_KINDS: readonly TileKind[] = Array.from(
  { length: TILE_KIND_COUNT },
  (_unused, kind) => kind,
).filter(isYaochuuKind);

// ---------------------------------------------------------------------------
// Wire conversion
// ---------------------------------------------------------------------------

/** The canonical (non-red) wire string for a face. */
export function kindToStr(kind: TileKind): TileStr {
  requireTileKind(kind);
  return `${rankOfKind(kind)}${suitOfKind(kind)}` as TileStr;
}

/** Exact wire form of a physical tile — red fives render as `0m` / `0p` / `0s`. */
export function tileIdToStr(id: TileId): TileStr {
  requireTileId(id);
  if (isRedTileId(id)) return `0${suitOfKind(kindOf(id)) as Suit}`;
  return kindToStr(kindOf(id));
}

/** The face a wire string denotes. `0m` → kind 4 (5m). */
export function tileStrToKind(value: TileStr): TileKind {
  if (!isTileStr(value)) throw new RangeError(`Not a TileStr: ${String(value)}`);
  const rankChar = value.charCodeAt(0) - 48;
  const suit = value.charAt(1) as TileSuit;
  // '0x' is the red five of suit x.
  return kindOfSuitRank(suit, rankChar === 0 ? 5 : rankChar);
}

/**
 * A *canonical* physical tile for a wire string.
 *
 * `TileStr → TileId` is lossy in general (three ordinary 5m exist), so this returns a stable
 * representative: the red instance for `0m`/`0p`/`0s`, and the first non-red copy otherwise.
 * The server resolves a client's `TileStr` against that player's actual hand — it never uses
 * this function to decide *which* copy a player meant.
 */
export function tileStrToCanonicalId(value: TileStr): TileId {
  const kind = tileStrToKind(value);
  if (isRedTileStr(value)) return kind * COPIES_PER_KIND;
  // For 5m/5p/5s copy 0 is the red one, so skip it.
  return kind * COPIES_PER_KIND + (RED_FIVE_KINDS.includes(kind) ? 1 : 0);
}

/**
 * Sort order for wire tiles: by kind, red five first within its kind.
 * Matches ascending `TileId` order, which is how hands are stored.
 */
export function compareTileStr(a: TileStr, b: TileStr): number {
  const byKind = tileStrToKind(a) - tileStrToKind(b);
  if (byKind !== 0) return byKind;
  return Number(isRedTileStr(b)) - Number(isRedTileStr(a));
}

// ---------------------------------------------------------------------------
// Dora
// ---------------------------------------------------------------------------

/**
 * Indicator → dora, cyclic within its group.
 *
 * `1m…8m → 2m…9m`, `9m → 1m` (same for p/s); `E→S→W→N→E`; `Haku→Hatsu→Chun→Haku`.
 * Red fives are counted separately and are never derived from an indicator.
 */
export function doraFromIndicatorKind(indicator: TileKind): TileKind {
  requireTileKind(indicator);
  if (indicator < KIND_EAST) {
    const base = indicator - (indicator % 9);
    return base + (((indicator % 9) + 1) % 9);
  }
  if (indicator <= KIND_NORTH) {
    return KIND_EAST + ((indicator - KIND_EAST + 1) % 4);
  }
  return KIND_HAKU + ((indicator - KIND_HAKU + 1) % 3);
}

/** {@link doraFromIndicatorKind} for a physical indicator tile. */
export function doraFromIndicator(indicator: TileId): TileKind {
  return doraFromIndicatorKind(kindOf(indicator));
}
