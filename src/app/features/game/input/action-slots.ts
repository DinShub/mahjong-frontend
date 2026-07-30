import type { Action, ClientAction } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';
import type { Prompt } from '@contracts/views';

/**
 * Turning `prompt.options` into buttons, without ever inventing one.
 *
 * `docs/07-frontend.md` §3: the action bar renders **exactly** the options in `prompt.options` and
 * nothing else, ever. There is no client-side "can I pon?".
 *
 * The other half of the rule is `docs/08-graphics-ux.md`'s *"never reflow between prompts — a call
 * window is 5 seconds and a moved button costs the whole window"*. That is why the slot list below
 * is fixed and complete: every prompt renders all eight cells and fills the ones it was offered, so
 * Pon is in the same place in the window where you can also Ron as in the window where you cannot.
 */
export type ActionKind = 'ron' | 'tsumo' | 'kan' | 'pon' | 'chi' | 'riichi' | 'kyuushu' | 'pass';

/** Left to right. Wins first, `pass` last and alone at the end where it cannot be hit by accident. */
export const ACTION_KINDS: readonly ActionKind[] = [
  'ron',
  'tsumo',
  'kan',
  'pon',
  'chi',
  'riichi',
  'kyuushu',
  'pass',
];

export const ACTION_LABEL: Readonly<Record<ActionKind, string>> = {
  ron: 'Ron',
  tsumo: 'Tsumo',
  kan: 'Kan',
  pon: 'Pon',
  chi: 'Chi',
  riichi: 'Riichi',
  kyuushu: 'Draw',
  pass: 'Pass',
};

export interface ActionSlot {
  kind: ActionKind;
  label: string;
  /** Every option that this button stands for. More than one means the player must choose which. */
  options: ClientAction[];
  /** `riichi` opens a discard mode instead of submitting anything. */
  opensRiichiMode: boolean;
}

function isClientAction(action: Action): action is ClientAction {
  return action.type !== 'draw' && action.type !== 'auto-discard';
}

function kindOf(action: ClientAction): ActionKind | null {
  switch (action.type) {
    case 'ron':
      return 'ron';
    case 'tsumo':
      return 'tsumo';
    case 'daiminkan':
    case 'shouminkan':
    case 'ankan':
      return 'kan';
    case 'pon':
      return 'pon';
    case 'chi':
      return 'chi';
    case 'kyuushu':
      return 'kyuushu';
    case 'pass':
      return 'pass';
    case 'discard':
      // A riichi discard is not a discard button — it is the Riichi button plus a tile choice.
      return action.riichi === true ? 'riichi' : null;
    default:
      return null;
  }
}

/** Every slot, in fixed order; `options` empty where the prompt did not offer it. */
export function actionSlots(prompt: Prompt | null): ActionSlot[] {
  const options = (prompt?.options ?? []).filter(isClientAction);
  return ACTION_KINDS.map((kind) => ({
    kind,
    label: ACTION_LABEL[kind],
    options: options.filter((option) => kindOf(option) === kind),
    opensRiichiMode: kind === 'riichi',
  }));
}

/** Tiles the player may discard normally — the hand's selectable set. */
export function discardTiles(prompt: Prompt | null): TileStr[] {
  return (prompt?.options ?? [])
    .filter((option) => option.type === 'discard' && option.riichi !== true)
    .map((option) => (option as { tile: TileStr }).tile);
}

/** Tiles that keep the hand tenpai — the only ones selectable in riichi mode. */
export function riichiTiles(prompt: Prompt | null): TileStr[] {
  return (prompt?.options ?? [])
    .filter((option) => option.type === 'discard' && option.riichi === true)
    .map((option) => (option as { tile: TileStr }).tile);
}

/** A short description of a call variant, for the chooser: `"chi 3m 4m"`. */
export function variantLabel(action: ClientAction): string {
  switch (action.type) {
    case 'chi':
    case 'pon':
      return `${action.type} ${action.tiles.join(' ')}`;
    case 'shouminkan':
      return `kan ${action.tile}`;
    case 'ankan':
      return `concealed kan ${String(action.kind)}`;
    case 'discard':
      return `riichi, discard ${action.tile}`;
    default:
      return action.type;
  }
}

/** The tiles a variant is made of, so the chooser can show faces rather than text. */
export function variantTiles(action: ClientAction): TileStr[] {
  switch (action.type) {
    case 'chi':
    case 'pon':
      return [...action.tiles];
    case 'shouminkan':
      return [action.tile];
    case 'discard':
      return [action.tile];
    default:
      return [];
  }
}
