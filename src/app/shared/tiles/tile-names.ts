import { isRedTileStr } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';

import type { TileNaming } from '@core/settings/settings.service';

/**
 * What a screen reader says for a tile.
 *
 * Both namings ship and the player picks (`docs/07-frontend.md` §7). This is not politeness: a
 * player who learned the game in Japanese hears "5 of circles" as a translation exercise, and a
 * player who did not hears "uu pin" as noise. Neither can be made the default for the other.
 */

const WESTERN_SUIT: Readonly<Record<string, string>> = {
  m: 'characters',
  p: 'circles',
  s: 'bamboo',
};

const JAPANESE_SUIT: Readonly<Record<string, string>> = {
  m: 'man',
  p: 'pin',
  s: 'sou',
};

const WESTERN_HONOUR: Readonly<Record<number, string>> = {
  1: 'East wind',
  2: 'South wind',
  3: 'West wind',
  4: 'North wind',
  5: 'white dragon',
  6: 'green dragon',
  7: 'red dragon',
};

const JAPANESE_HONOUR: Readonly<Record<number, string>> = {
  1: 'ton',
  2: 'nan',
  3: 'shaa',
  4: 'pei',
  5: 'haku',
  6: 'hatsu',
  7: 'chun',
};

export function tileName(tile: TileStr, naming: TileNaming): string {
  const suit = tile[1] ?? 'z';
  const rank = Number(tile[0]);
  const red = isRedTileStr(tile);

  if (suit === 'z') {
    return (naming === 'japanese' ? JAPANESE_HONOUR : WESTERN_HONOUR)[rank] ?? tile;
  }

  const shown = red ? 5 : rank;
  if (naming === 'japanese') {
    return `${red ? 'aka ' : ''}${String(shown)} ${JAPANESE_SUIT[suit] ?? suit}`;
  }
  return `${String(shown)} of ${WESTERN_SUIT[suit] ?? suit}${red ? ', red' : ''}`;
}

/** The label a face-down tile carries — it has no identity to announce. */
export const FACE_DOWN_LABEL = 'face-down tile';
