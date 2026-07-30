import type { LimitName, YakuId } from '@contracts/actions';

import type { YakuNaming } from '@core/settings/settings.service';

/**
 * Yaku names in three forms, and the player picks.
 *
 * `docs/07-frontend.md` §8 is blunt about why: *"this is a real preference split in the mahjong
 * community and picking one alienates half the users."* The ids themselves never change — they are
 * in the event log and the database — so this table is presentation and nothing else.
 */
interface YakuNameSet {
  romaji: string;
  kanji: string;
  english: string;
}

export const YAKU_NAMES: Readonly<Record<YakuId, YakuNameSet>> = {
  riichi: { romaji: 'riichi', kanji: '立直', english: 'Ready hand' },
  ippatsu: { romaji: 'ippatsu', kanji: '一発', english: 'One-shot' },
  menzen_tsumo: { romaji: 'menzen tsumo', kanji: '門前清自摸和', english: 'Self-draw' },
  pinfu: { romaji: 'pinfu', kanji: '平和', english: 'No-points hand' },
  tanyao: { romaji: 'tanyao', kanji: '断幺九', english: 'All simples' },
  yakuhai_haku: { romaji: 'haku', kanji: '白', english: 'White dragon' },
  yakuhai_hatsu: { romaji: 'hatsu', kanji: '發', english: 'Green dragon' },
  yakuhai_chun: { romaji: 'chun', kanji: '中', english: 'Red dragon' },
  yakuhai_seat_wind: { romaji: 'jikaze', kanji: '自風', english: 'Seat wind' },
  yakuhai_round_wind: { romaji: 'bakaze', kanji: '場風', english: 'Round wind' },
  iipeikou: { romaji: 'iipeikou', kanji: '一盃口', english: 'Pure double sequence' },
  haitei_raoyue: { romaji: 'haitei raoyue', kanji: '海底摸月', english: 'Last tile from the wall' },
  houtei_raoyui: { romaji: 'houtei raoyui', kanji: '河底撈魚', english: 'Last discard' },
  rinshan_kaihou: { romaji: 'rinshan kaihou', kanji: '嶺上開花', english: 'Dead-wall draw' },
  chankan: { romaji: 'chankan', kanji: '搶槓', english: 'Robbing a kan' },
  double_riichi: { romaji: 'double riichi', kanji: '両立直', english: 'Double ready' },
  chiitoitsu: { romaji: 'chiitoitsu', kanji: '七対子', english: 'Seven pairs' },
  sanshoku_doujun: {
    romaji: 'sanshoku doujun',
    kanji: '三色同順',
    english: 'Three-colour straight',
  },
  ittsuu: { romaji: 'ittsuu', kanji: '一気通貫', english: 'Pure straight' },
  chanta: { romaji: 'chanta', kanji: '混全帯幺九', english: 'Half outside hand' },
  toitoi: { romaji: 'toitoi', kanji: '対々和', english: 'All triplets' },
  sanankou: { romaji: 'sanankou', kanji: '三暗刻', english: 'Three concealed triplets' },
  sanshoku_doukou: {
    romaji: 'sanshoku doukou',
    kanji: '三色同刻',
    english: 'Three-colour triplets',
  },
  sankantsu: { romaji: 'sankantsu', kanji: '三槓子', english: 'Three kans' },
  shousangen: { romaji: 'shousangen', kanji: '小三元', english: 'Little three dragons' },
  honroutou: { romaji: 'honroutou', kanji: '混老頭', english: 'All terminals and honours' },
  honitsu: { romaji: 'honitsu', kanji: '混一色', english: 'Half flush' },
  junchan: { romaji: 'junchan', kanji: '純全帯幺九', english: 'Fully outside hand' },
  ryanpeikou: { romaji: 'ryanpeikou', kanji: '二盃口', english: 'Twice pure double sequence' },
  chinitsu: { romaji: 'chinitsu', kanji: '清一色', english: 'Full flush' },
  kokushi_musou: { romaji: 'kokushi musou', kanji: '国士無双', english: 'Thirteen orphans' },
  suuankou: { romaji: 'suuankou', kanji: '四暗刻', english: 'Four concealed triplets' },
  daisangen: { romaji: 'daisangen', kanji: '大三元', english: 'Big three dragons' },
  shousuushii: { romaji: 'shousuushii', kanji: '小四喜', english: 'Little four winds' },
  daisuushii: { romaji: 'daisuushii', kanji: '大四喜', english: 'Big four winds' },
  tsuuiisou: { romaji: 'tsuuiisou', kanji: '字一色', english: 'All honours' },
  chinroutou: { romaji: 'chinroutou', kanji: '清老頭', english: 'All terminals' },
  ryuuiisou: { romaji: 'ryuuiisou', kanji: '緑一色', english: 'All green' },
  chuuren_poutou: { romaji: 'chuuren poutou', kanji: '九蓮宝燈', english: 'Nine gates' },
  suukantsu: { romaji: 'suukantsu', kanji: '四槓子', english: 'Four kans' },
  tenhou: { romaji: 'tenhou', kanji: '天和', english: 'Blessing of heaven' },
  chiihou: { romaji: 'chiihou', kanji: '地和', english: 'Blessing of earth' },
};

export function yakuName(id: YakuId, naming: YakuNaming): string {
  const names = YAKU_NAMES[id];
  return names[naming];
}

export const LIMIT_NAMES: Readonly<Record<LimitName, YakuNameSet>> = {
  mangan: { romaji: 'mangan', kanji: '満貫', english: 'Mangan' },
  haneman: { romaji: 'haneman', kanji: '跳満', english: 'Haneman' },
  baiman: { romaji: 'baiman', kanji: '倍満', english: 'Baiman' },
  sanbaiman: { romaji: 'sanbaiman', kanji: '三倍満', english: 'Sanbaiman' },
  kazoe_yakuman: { romaji: 'kazoe yakuman', kanji: '数え役満', english: 'Counted yakuman' },
  yakuman: { romaji: 'yakuman', kanji: '役満', english: 'Yakuman' },
};

export function limitName(limit: LimitName, naming: YakuNaming): string {
  return LIMIT_NAMES[limit][naming];
}
