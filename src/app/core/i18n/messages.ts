/**
 * The Japanese message catalogue.
 *
 * Spec: `docs/07-frontend.md` §8 — *"`@angular/localize`, English and Japanese at launch."*
 *
 * **Runtime translation, not per-locale bundles.** `@angular/localize` supports both: the
 * ahead-of-time path builds one bundle per locale and serves them from `/en/` and `/ja/`, and the
 * runtime path calls `loadTranslations()` before `bootstrapApplication` and translates `$localize`
 * messages in place. The runtime path is the one that fits: locale here is a *setting*, sitting
 * next to the tile set and the sound levels, and a setting that changes the URL prefix and
 * redeploys the app to take effect is not a setting.
 *
 * **Every message carries an explicit id** (`i18n="@@some.id"`, `` $localize`:@@some.id:text` ``).
 * This is not a style preference — it is what makes the file work. Without one, `$localize` derives
 * the id from a hash of the source text and its metadata, so a catalogue keyed by the English
 * sentence silently translates nothing, and a copy edit to a translated string silently drops its
 * translation. An id also survives the edit.
 *
 * English is the source locale and has no catalogue: the source text *is* the English text, and an
 * identity map would be a second copy of every string to keep in step with the templates.
 *
 * Scope: the M5 screens (profile, replay, settings) plus the lobby's links into them.
 * `tasks/backlog.md` M5 asks for *"i18n en + ja"* as a mechanism plus the yaku-naming split, which
 * `shared/yaku/yaku-names.ts` has owned since M4. The board's own strings follow the same path.
 */

export type Locale = 'en' | 'ja';

/** `messageId → translated text`, in `@angular/localize`'s runtime format. */
export type MessageCatalogue = Record<string, string>;

const JA: MessageCatalogue = {
  // Lobby links into M5
  'lobby.title': 'ロビー',
  'nav.profile': 'プロフィール',
  'nav.settings': '設定',

  // Profile
  'profile.placements': '着順',
  'profile.rates': '成績',
  'profile.games': '対局',
  'profile.yaku': 'よく和了した役',
  'profile.avgPlacement': '平均着順',
  'profile.avgPlacementHint': '2.50 が平均です',
  'profile.empty': 'まだ対局が終わっていません。最初の対局のあとに表示されます。',
  'profile.noGames': 'まだ対局がありません。',
  'profile.loadMore': 'もっと見る',
  'profile.loading': '読み込み中…',
  'profile.since': '登録日',
  'profile.guest': 'ゲスト',
  'profile.replay': '牌譜',
  'profile.winRate': '和了率',
  'profile.dealInRate': '放銃率',
  'profile.riichiRate': '立直率',
  'profile.callRate': '副露率',
  'profile.tsumoShare': 'ツモ率',
  'profile.avgWin': '平均和了点',
  'profile.avgDealIn': '平均放銃点',
  'profile.tenpaiAtDraw': '流局聴牌率',
  'profile.hanchan': '半荘',
  'profile.tonpuusen': '東風戦',

  // Replay
  'replay.unavailable': '牌譜を表示できません',
  'replay.loading': '牌譜を読み込み中…',
  'replay.prevHand': '前局',
  'replay.nextHand': '次局',
  'replay.play': '再生',
  'replay.pause': '一時停止',
  'replay.stepForward': '1手進む',
  'replay.stepBack': '1手戻る',
  'replay.position': '位置',
  'replay.viewpoint': '視点',
  'replay.speed': '速度',
  'replay.allRevealed': '全門公開',
  'replay.verify': '牌山を検証',
  'replay.verifying': '検証中…',

  // Settings
  'settings.title': '設定',
  'settings.appearance': '表示',
  'settings.theme': 'テーマ',
  'settings.tileSet': '牌のデザイン',
  'settings.suitColour': '数牌を色分け',
  'settings.highlightDora': '手牌のドラを強調',
  'settings.autoSort': '手牌を自動整理',
  'settings.play': 'プレイ',
  'settings.discardMode': '打牌方法',
  'settings.discardHint':
    'ワンクリックは速い代わりに誤打が増えます。既定は選択してから確定です。',
  'settings.yakuNames': '役名',
  'settings.tileNames': '牌の名前',
  'settings.sound': '音',
  'settings.sfx': '効果音',
  'settings.voice': '発声',
  'settings.voiceNote': '音声パックが未導入のため、鳴きは画面表示のみです。',
  'settings.test': 'テスト',
  'settings.motion': 'アニメーション',
  'settings.language': '言語',
  'settings.localeHint': '言語を変更するとアプリを再読み込みします。',
  'settings.reset': '初期設定に戻す',
  'settings.themeClassic': '緑卓',
  'settings.themeDark': 'ダーク',
  'settings.tilesTraditional': '伝統',
  'settings.tilesHighContrast': '高コントラスト',
  'settings.discardSelectConfirm': '選択してから確定',
  'settings.discardOneClick': 'ワンクリック',
  'settings.yakuRomaji': 'ローマ字',
  'settings.yakuKanji': '漢字',
  'settings.yakuEnglish': '英語',
  'settings.tilesWestern': '英数字',
  'settings.tilesJapanese': '日本語',
  'settings.motionSystem': 'システムに合わせる',
  'settings.motionReduce': 'アニメーションを減らす',
  'settings.motionFull': '通常',
};

const CATALOGUES: Record<Locale, MessageCatalogue | null> = {
  en: null,
  ja: JA,
};

export function catalogueFor(locale: Locale): MessageCatalogue | null {
  return CATALOGUES[locale];
}
