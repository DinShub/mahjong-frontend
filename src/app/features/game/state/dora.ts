import {
  RED_FIVE_KINDS,
  doraFromIndicatorKind,
  tileStrToKind,
  isRedTileStr,
} from '@contracts/tiles';
import type { TileKind, TileStr } from '@contracts/tiles';

/**
 * Which kinds are dora, from the revealed indicators.
 *
 * This is display only — the dora *count* in a win arrives inside `AgariResult` and is never
 * recomputed here. What it drives is the optional outline on the player's own dora
 * (`docs/08-graphics-ux.md` §5), which is a reading aid and cannot be allowed to disagree with the
 * server about anything that matters.
 */
export function doraKinds(indicators: readonly TileStr[]): Set<TileKind> {
  return new Set(indicators.map((indicator) => doraFromIndicatorKind(tileStrToKind(indicator))));
}

/** A red five is dora on its own account, indicator or not. */
export function isDora(tile: TileStr, kinds: ReadonlySet<TileKind>): boolean {
  if (isRedTileStr(tile)) return true;
  return kinds.has(tileStrToKind(tile));
}

export const RED_KINDS: readonly TileKind[] = RED_FIVE_KINDS;
