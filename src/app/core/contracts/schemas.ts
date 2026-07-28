/**
 * Runtime validation for everything that crosses the wire.
 *
 * These zod schemas mirror the TypeScript declarations in the sibling contract modules; the
 * mirroring is enforced by compile-time assertions in `schemas.spec.ts` (mutual assignability
 * between each schema's inferred type and its interface), so drift fails `npm run typecheck`.
 *
 * The gateway validates **every** inbound payload with the schemas here — an unvalidated `any`
 * reaching the engine is a review blocker (`docs/11-nonfunctional.md` §6). The frontend uses the
 * same schemas (synced, not re-declared) so a protocol mismatch surfaces as a typed error rather
 * than `undefined` three layers deep.
 *
 * zod is the ONLY runtime dependency permitted in `contracts/`.
 */

import { z } from 'zod';

import { MELD_TYPES, YAKU_IDS } from './actions.js';
import { ERROR_CODES, STAMP_IDS } from './protocol.js';
import { ALL_TILE_STRS, TILE_COUNT, TILE_KIND_COUNT } from './tiles.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const tileStrSchema = z.enum(ALL_TILE_STRS);

export const tileKindSchema = z
  .number()
  .int()
  .min(0)
  .max(TILE_KIND_COUNT - 1);

export const tileIdSchema = z
  .number()
  .int()
  .min(0)
  .max(TILE_COUNT - 1);

export const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const windSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

/** Mongo `ObjectId`, hex-encoded — how ids appear on the wire (`docs/09-database.md`). */
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/, 'expected a 24-character hex id');

export const promptIdSchema = z.uuid();

export const ticketIdSchema = z.string().min(1).max(64);

export const inviteCodeSchema = z.string().regex(/^[A-Z0-9]{4,12}$/, 'expected an invite code');

export const scoreSchema = z.number().int();

export const scoresSchema = z.array(scoreSchema).length(4);

export const gameLengthSchema = z.enum(['tonpuusen', 'hanchan']);

export const botLevelSchema = z.enum(['easy', 'normal', 'hard']);

export const seatFillSchema = z.enum(['open', 'bot', 'locked']);

export const connectionStateSchema = z.enum(['online', 'disconnected', 'bot']);

export const gamePhaseSchema = z.enum([
  'waiting',
  'hand-start',
  'awaiting-draw',
  'awaiting-discard',
  'awaiting-calls',
  'awaiting-chankan',
  'hand-end',
  'game-end',
]);

export const yakuIdSchema = z.enum(YAKU_IDS);

export const limitNameSchema = z.enum([
  'mangan',
  'haneman',
  'baiman',
  'sanbaiman',
  'kazoe_yakuman',
  'yakuman',
]);

export const ryuukyokuReasonSchema = z.enum([
  'exhaustive',
  'kyuushu_kyuuhai',
  'suufon_renda',
  'suucha_riichi',
  'suukaikan',
  'sanchahou',
]);

export const meldTypeSchema = z.enum(MELD_TYPES);

export const stampIdSchema = z.enum(STAMP_IDS);

export const errorCodeSchema = z.enum(ERROR_CODES);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const ruleConfigSchema = z.object({
  profile: z.literal('standard'),
  length: gameLengthSchema,
  startingPoints: z.number().int(),
  returnPoints: z.number().int(),
  uma: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
  redFives: z.object({
    m: z.number().int().min(0).max(4),
    p: z.number().int().min(0).max(4),
    s: z.number().int().min(0).max(4),
  }),
  kuitan: z.boolean(),
  kuikae: z.boolean(),
  atozuke: z.boolean(),
  agariYame: z.boolean(),
  tobi: z.boolean(),
  enchousen: z.boolean(),
  nagashiMangan: z.boolean(),
  doubleRon: z.boolean(),
  sanchahouAborts: z.boolean(),
  sekininBarai: z.boolean(),
  kazoeYakuman: z.boolean(),
  doubleYakuman: z.boolean(),
  renhou: z.enum(['none', 'mangan', 'yakuman']),
  kiriageMangan: z.boolean(),
  chankanOnAnkan: z.boolean(),
  uraDora: z.boolean(),
  kanDora: z.boolean(),
  kanUraDora: z.boolean(),
  ippatsu: z.boolean(),
});

// ---------------------------------------------------------------------------
// Melds, discards, players
// ---------------------------------------------------------------------------

export const meldWireSchema = z.object({
  type: meldTypeSchema,
  tiles: z.array(tileStrSchema).min(3).max(4),
  calledTile: tileStrSchema.nullable(),
  from: seatSchema.nullable(),
  calledIndex: z.number().int().min(0).max(3).nullable(),
});

export const discardWireSchema = z.object({
  tile: tileStrSchema,
  tsumogiri: z.boolean(),
  riichiDeclaration: z.boolean(),
  calledBy: seatSchema.nullable(),
});

export const playerInfoSchema = z.object({
  userId: objectIdSchema.nullable(),
  displayName: z.string().min(1).max(32),
  avatarId: z.string().min(1).max(64),
  isBot: z.boolean(),
  botLevel: botLevelSchema.nullable(),
});

export const seatConfigSchema = z.object({
  fill: seatFillSchema,
  botLevel: botLevelSchema.optional(),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const drawActionSchema = z.strictObject({ type: z.literal('draw') });

const discardActionSchema = z.strictObject({
  type: z.literal('discard'),
  tile: tileStrSchema,
  riichi: z.boolean().optional(),
});

const chiActionSchema = z.strictObject({
  type: z.literal('chi'),
  tiles: z.tuple([tileStrSchema, tileStrSchema]),
});

const ponActionSchema = z.strictObject({
  type: z.literal('pon'),
  tiles: z.tuple([tileStrSchema, tileStrSchema]),
});

const daiminkanActionSchema = z.strictObject({ type: z.literal('daiminkan') });

const shouminkanActionSchema = z.strictObject({
  type: z.literal('shouminkan'),
  tile: tileStrSchema,
});

const ankanActionSchema = z.strictObject({
  type: z.literal('ankan'),
  kind: tileKindSchema,
});

const tsumoActionSchema = z.strictObject({ type: z.literal('tsumo') });
const ronActionSchema = z.strictObject({ type: z.literal('ron') });
const kyuushuActionSchema = z.strictObject({ type: z.literal('kyuushu') });
const passActionSchema = z.strictObject({ type: z.literal('pass') });
const autoDiscardActionSchema = z.strictObject({ type: z.literal('auto-discard') });

/** Every action, including the server-originated ones. */
export const actionSchema = z.discriminatedUnion('type', [
  drawActionSchema,
  discardActionSchema,
  chiActionSchema,
  ponActionSchema,
  daiminkanActionSchema,
  shouminkanActionSchema,
  ankanActionSchema,
  tsumoActionSchema,
  ronActionSchema,
  kyuushuActionSchema,
  passActionSchema,
  autoDiscardActionSchema,
]);

/**
 * What a client may send. `draw` and `auto-discard` are server-originated; accepting them from a
 * socket would let a client fabricate a draw or skip its own turn.
 */
export const clientActionSchema = z.discriminatedUnion('type', [
  discardActionSchema,
  chiActionSchema,
  ponActionSchema,
  daiminkanActionSchema,
  shouminkanActionSchema,
  ankanActionSchema,
  tsumoActionSchema,
  ronActionSchema,
  kyuushuActionSchema,
  passActionSchema,
]);

export const promptSchema = z.object({
  promptId: promptIdSchema,
  seat: seatSchema,
  options: z.array(actionSchema),
  deadline: z.number().int(),
  bankRemaining: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const yakuValueSchema = z.object({
  name: yakuIdSchema,
  han: z.number().int().min(0),
});

export const agariResultSchema = z.object({
  seat: seatSchema,
  from: seatSchema,
  hand: z.array(tileStrSchema),
  melds: z.array(meldWireSchema),
  winningTile: tileStrSchema,
  yaku: z.array(yakuValueSchema),
  yakuman: z.array(yakuIdSchema),
  dora: z.number().int().min(0),
  uraDora: z.number().int().min(0),
  redDora: z.number().int().min(0),
  han: z.number().int().min(0),
  fu: z.number().int().min(0),
  points: z.number().int(),
  scoreDeltas: scoresSchema,
  limitName: limitNameSchema.nullable(),
});

export const placementSchema = z.object({
  seat: seatSchema,
  place: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  finalScore: scoreSchema,
  netScore: z.number(),
});

const gameStartEventSchema = z.object({
  t: z.literal('game-start'),
  config: ruleConfigSchema,
  players: z.array(playerInfoSchema).length(4),
  seedHash: z.string().regex(/^[0-9a-f]{64}$/),
  seed: z.string().optional(),
});

const handStartEventSchema = z.object({
  t: z.literal('hand-start'),
  handIndex: z.number().int().min(0),
  round: windSchema,
  kyoku: z.number().int().min(1).max(4),
  honba: z.number().int().min(0),
  riichiSticks: z.number().int().min(0),
  dealer: seatSchema,
  scores: scoresSchema,
  hands: z.array(z.array(tileStrSchema).nullable()).length(4),
  doraIndicator: tileStrSchema,
});

const drawEventSchema = z.object({
  t: z.literal('draw'),
  seat: seatSchema,
  tile: tileStrSchema.nullable(),
  fromRinshan: z.boolean(),
  wallRemaining: z.number().int().min(0),
});

const discardEventSchema = z.object({
  t: z.literal('discard'),
  seat: seatSchema,
  tile: tileStrSchema,
  tsumogiri: z.boolean(),
  riichi: z.boolean(),
});

const callEventSchema = z.object({
  t: z.literal('call'),
  seat: seatSchema,
  meld: meldWireSchema,
  from: seatSchema,
});

const riichiAcceptedEventSchema = z.object({
  t: z.literal('riichi-accepted'),
  seat: seatSchema,
  sticks: z.number().int().min(0),
  scores: scoresSchema,
});

const doraRevealedEventSchema = z.object({
  t: z.literal('dora-revealed'),
  indicator: tileStrSchema,
});

const agariEventSchema = z.object({
  t: z.literal('agari'),
  winners: z.array(agariResultSchema).min(1).max(2),
  scores: scoresSchema,
  scoreDeltas: scoresSchema,
  uraIndicators: z.array(tileStrSchema).optional(),
});

const ryuukyokuEventSchema = z.object({
  t: z.literal('ryuukyoku'),
  reason: ryuukyokuReasonSchema,
  tenpai: z.array(z.boolean()).length(4),
  hands: z.array(z.array(tileStrSchema).nullable()).length(4),
  scores: scoresSchema,
  scoreDeltas: scoresSchema,
  nagashi: z.array(seatSchema).optional(),
});

const handEndEventSchema = z.object({
  t: z.literal('hand-end'),
  nextDealer: seatSchema,
  nextHonba: z.number().int().min(0),
  riichiSticks: z.number().int().min(0),
});

const gameEndEventSchema = z.object({
  t: z.literal('game-end'),
  placements: z.array(placementSchema).length(4),
  seed: z.string(),
});

export const gameEventSchema = z.discriminatedUnion('t', [
  gameStartEventSchema,
  handStartEventSchema,
  drawEventSchema,
  discardEventSchema,
  callEventSchema,
  riichiAcceptedEventSchema,
  doraRevealedEventSchema,
  agariEventSchema,
  ryuukyokuEventSchema,
  handEndEventSchema,
  gameEndEventSchema,
]);

/** `ServerEvent<T>` — the ordered envelope. */
export function serverEventSchema<T extends z.ZodType>(payload: T) {
  return z.object({
    seq: z.number().int().min(1),
    ts: z.number().int(),
    payload,
  });
}

export const serverGameEventSchema = serverEventSchema(gameEventSchema);

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const playerViewSeatSchema = z.object({
  seat: seatSchema,
  player: playerInfoSchema,
  handSize: z.number().int().min(0).max(14),
  hand: z.array(tileStrSchema).nullable(),
  drawn: tileStrSchema.nullable(),
  melds: z.array(meldWireSchema),
  discards: z.array(discardWireSchema),
  riichi: z.object({ declaredOnTurn: z.number().int().min(0), ippatsu: z.boolean() }).nullable(),
  isTenpaiRevealed: z.boolean(),
  connection: connectionStateSchema,
  clockBank: z.number().int().min(0),
});

export const playerViewSchema = z.object({
  seq: z.number().int().min(0),
  tableId: objectIdSchema,
  config: ruleConfigSchema,
  round: windSchema,
  kyoku: z.number().int().min(1).max(4),
  honba: z.number().int().min(0),
  riichiSticks: z.number().int().min(0),
  dealer: seatSchema,
  mySeat: seatSchema.nullable(),
  scores: scoresSchema,
  wallRemaining: z.number().int().min(0),
  doraIndicators: z.array(tileStrSchema).max(5),
  players: z.array(playerViewSeatSchema).length(4),
  phase: gamePhaseSchema,
  turn: seatSchema,
  pendingPrompt: promptSchema.nullable(),
  lastEventSeq: z.number().int().min(0),
});

export const tableSeatStateSchema = z.object({
  seat: seatSchema,
  config: seatConfigSchema,
  player: playerInfoSchema.nullable(),
  ready: z.boolean(),
  connection: connectionStateSchema,
});

export const tableStateSchema = z.object({
  tableId: objectIdSchema,
  status: z.enum(['waiting', 'starting', 'in_progress', 'finished']),
  hostUserId: objectIdSchema.nullable(),
  config: ruleConfigSchema,
  length: gameLengthSchema,
  isPrivate: z.boolean(),
  inviteCode: inviteCodeSchema.nullable(),
  seats: z.array(tableSeatStateSchema).length(4),
  gameId: objectIdSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Handshake and inbound payloads
// ---------------------------------------------------------------------------

/** Query parameters arrive as strings, so `protocolVersion` is coerced. */
export const handshakeAuthSchema = z.object({
  token: z.string().min(1).optional(),
  protocolVersion: z.coerce.number().int().min(0),
});

export const lobbyQuickmatchPayloadSchema = z.strictObject({
  length: gameLengthSchema,
});

export const lobbyCancelPayloadSchema = z.strictObject({
  ticketId: ticketIdSchema,
});

export const tableCreatePayloadSchema = z.strictObject({
  length: gameLengthSchema,
  seats: z.tuple([seatConfigSchema, seatConfigSchema, seatConfigSchema, seatConfigSchema]),
  private: z.boolean(),
});

export const tableJoinPayloadSchema = z
  .strictObject({
    tableId: objectIdSchema.optional(),
    inviteCode: inviteCodeSchema.optional(),
  })
  .refine(
    (value) => (value.tableId === undefined) !== (value.inviteCode === undefined),
    'exactly one of tableId / inviteCode is required',
  );

export const tableIdPayloadSchema = z.strictObject({
  tableId: objectIdSchema,
});

export const tableSetSeatPayloadSchema = z.strictObject({
  tableId: objectIdSchema,
  seat: seatSchema,
  fill: seatFillSchema,
  botLevel: botLevelSchema.optional(),
});

export const tableReadyPayloadSchema = z.strictObject({
  tableId: objectIdSchema,
  ready: z.boolean(),
});

export const gameActionPayloadSchema = z.strictObject({
  tableId: objectIdSchema,
  promptId: promptIdSchema,
  action: clientActionSchema,
});

export const gameResyncPayloadSchema = z.strictObject({
  tableId: objectIdSchema,
  fromSeq: z.number().int().min(0).optional(),
});

export const gameStampPayloadSchema = z.strictObject({
  tableId: objectIdSchema,
  stampId: stampIdSchema,
});

export const protocolErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  promptId: promptIdSchema.optional(),
});

/**
 * Inbound payload schema per client→server event. The gateway looks the schema up by event name,
 * so adding an event without a schema is a type error rather than an unvalidated hole.
 */
export const CLIENT_EVENT_SCHEMAS = {
  'lobby:quickmatch': lobbyQuickmatchPayloadSchema,
  'lobby:cancel': lobbyCancelPayloadSchema,
  'table:create': tableCreatePayloadSchema,
  'table:join': tableJoinPayloadSchema,
  'table:leave': tableIdPayloadSchema,
  'table:setSeat': tableSetSeatPayloadSchema,
  'table:ready': tableReadyPayloadSchema,
  'table:start': tableIdPayloadSchema,
  'spectate:join': tableIdPayloadSchema,
  'game:action': gameActionPayloadSchema,
  'game:resync': gameResyncPayloadSchema,
  'game:stamp': gameStampPayloadSchema,
} as const;

/** Everything the emitter turns into JSON Schema. Keys become `schemas.json` top-level keys. */
export const SCHEMA_REGISTRY = {
  TileStr: tileStrSchema,
  Seat: seatSchema,
  Wind: windSchema,
  RuleConfig: ruleConfigSchema,
  MeldWire: meldWireSchema,
  DiscardWire: discardWireSchema,
  PlayerInfo: playerInfoSchema,
  SeatConfig: seatConfigSchema,
  Action: actionSchema,
  ClientAction: clientActionSchema,
  Prompt: promptSchema,
  YakuValue: yakuValueSchema,
  AgariResult: agariResultSchema,
  Placement: placementSchema,
  GameEvent: gameEventSchema,
  ServerGameEvent: serverGameEventSchema,
  PlayerViewSeat: playerViewSeatSchema,
  PlayerView: playerViewSchema,
  TableSeatState: tableSeatStateSchema,
  TableState: tableStateSchema,
  HandshakeAuth: handshakeAuthSchema,
  ProtocolError: protocolErrorSchema,
  LobbyQuickmatchPayload: lobbyQuickmatchPayloadSchema,
  LobbyCancelPayload: lobbyCancelPayloadSchema,
  TableCreatePayload: tableCreatePayloadSchema,
  TableJoinPayload: tableJoinPayloadSchema,
  TableIdPayload: tableIdPayloadSchema,
  TableSetSeatPayload: tableSetSeatPayloadSchema,
  TableReadyPayload: tableReadyPayloadSchema,
  GameActionPayload: gameActionPayloadSchema,
  GameResyncPayload: gameResyncPayloadSchema,
  GameStampPayload: gameStampPayloadSchema,
} as const;

export type SchemaName = keyof typeof SCHEMA_REGISTRY;
