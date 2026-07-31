# mahjong-frontend

Angular client for the Riichi Mahjong app. Its own git repository; the specs live in the parent
`mahjong-app` repo under `docs/`.

Angular 19, **standalone components only**, **signals** for state, `OnPush` everywhere. No NgRx —
the app's state is one server-authoritative view arriving as events, and a signal store models that
in a few hundred lines (`docs/07-frontend.md` §1).

## Quick start

```bash
npm ci
npm run sync:contracts   # pull the wire contract from ../backend
npm run sync:fixtures    # pull the recorded games the tests replay
npm start                # http://localhost:4200
```

With the backend running (`npm run dev` in `../backend`), the landing page says **Connected** after
a real socket handshake, and "Play as guest" leads to a lobby, a table and a game.

## Scripts

| Script                                 | What                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| `npm start`                            | `ng serve` on :4200                                            |
| `npm run build`                        | production bundle into `dist/`                                 |
| `npm run typecheck`                    | `tsc --noEmit` over the app, the specs and the e2e suite       |
| `npm run lint` / `lint:fix`            | eslint (flat config, angular-eslint incl. template a11y rules) |
| `npm run format` / `format:check`      | prettier                                                       |
| `npm test` / `test:watch` / `test:cov` | vitest (jsdom, Angular via `@analogjs/vite-plugin-angular`)    |
| `npm run e2e` / `e2e:ui`               | Playwright against the mock socket server                      |
| `npm run sync:contracts`               | copy the contract from the backend                             |
| `npm run check:contracts`              | fail if the contract was edited or is behind the backend       |
| `npm run sync:fixtures`                | copy the recorded games from the backend                       |
| `npm run check:fixtures`               | fail if the fixtures were edited or are behind the backend     |
| `npm run build:tiles`                  | assemble `public/tiles/traditional.svg` from `vendor/`         |
| `npm run check:tiles`                  | fail if the tile sheet has drifted from the vendored art       |

## Layout

```
src/app/
├── core/
│   ├── contracts/   synced from the backend — DO NOT EDIT
│   ├── config/      environment handling, APP_CONFIG
│   ├── socket/      typed socket.io wrapper, listener registry, RTT
│   ├── auth/        session storage, refresh interceptor, guest bootstrap
│   ├── session/     boot: a session, a socket, the active-table redirect
│   ├── settings/    theme, tile set, discard mode, naming, locale, sound
│   ├── i18n/        the ja catalogue; installed before bootstrap
│   ├── sound/       one AudioContext, synthesised effects, two channels
│   ├── layout/      viewport → stage scale, portrait breakpoint
│   └── time/        the one clock; a test drives it by hand
├── features/
│   ├── landing/     play as guest, sign in, upgrade; connection status
│   ├── lobby/       quickmatch, create a table, join by code
│   ├── table/       the pre-game seat/ready screen
│   ├── profile/     aggregates + game history                            [M5]
│   ├── replay/      the game's render layer, fed from a fetched log      [M5]
│   ├── settings/    every preference, in one place                       [M5]
│   └── game/
│       ├── state/   the event fold, the pacing queue, seat↔position
│       ├── render/  stage, board, seat zones, hands, ponds, melds, centre
│       ├── input/   action bar, prompt clock, auto-buttons
│       └── overlays/ agari, ryuukyoku, game end, connection, live region
└── shared/
    ├── tiles/       the tile component and the two face sets
    ├── motion/      the Web Animations API layer
    ├── theme/       contrast maths, used by the audit test
    └── yaku/        yaku names in romaji, kanji and English
```

### Two things here are generated

`src/app/core/contracts/` is copied from the backend's `dist-contracts/` and is never edited here.
It carries the types, the zod schemas and the constants (`PROTOCOL_VERSION`, tile helpers) — both
sides validate with the same schemas, so a protocol mismatch is a typed error rather than
`undefined` three layers deep.

`test-fixtures/` is copied from the backend's `dist-fixtures/`: real hands the M2 soak found,
replayed through the engine and projected for one seat, as a snapshot, the events that followed,
and **the view the engine held at the end**. That last part is what `apply-event.spec.ts` holds the
client's event fold to — a reference produced by the engine that passes the 12 009-hand conformance
gate, rather than an expectation somebody typed.

`test-fixtures/replay.json` is the odd one out: a **whole** game rather than a hand, **unredacted**
rather than projected, in the shape `GET /replays/:gameId` serves. It is what the replay tests fold
and what the seed verifier is checked against.

```bash
npm run sync:contracts -- --backend ../path/to/backend
npm run check:contracts        # CI: fails on hand-edits and on drift
npm run sync:fixtures
npm run check:fixtures
```

## Environments

`src/environments/environment*.ts` hold the only values that vary: `apiUrl` and `socketUrl`.

| Configuration           | Points at                                                           |
| ----------------------- | ------------------------------------------------------------------- |
| `development` (default) | `http://localhost:3000` — a locally running backend                 |
| `production`            | same origin (empty strings): the static host proxies to the backend |
| `e2e`                   | `http://127.0.0.1:3100` — the Playwright mock server                |

The protocol version is **not** an environment value: it comes from the synced contract.

## Testing

| Level             | Where                         | Notes                                                       |
| ----------------- | ----------------------------- | ----------------------------------------------------------- |
| Unit / component  | `src/**/*.spec.ts`            | vitest + jsdom; TestBed works normally                      |
| E2E               | `e2e/game.spec.ts`            | Playwright vs the mock, at desktop **and** phone viewports  |
| E2E               | `e2e/around-the-game.spec.ts` | profile, history, replay, settings, ja                      |
| Visual regression | `e2e/visual.spec.ts`          | screenshot diffs at three viewports, own Playwright project |

The e2e run starts its own app server on :4300 and its own mock on :3100 and never reuses an
existing server, so it cannot accidentally test whatever else happens to be listening on :4200. It
runs with **one worker**: the mock holds a single selected hand at a time, and each test names the
hand it plays.

The mock server speaks the same contract as the gateway — REST auth, the handshake, the lobby and
table events — and replays a recorded hand step by step: the events up to each decision, then the
exact options that seat was offered, checking the client's answer was one of them. It decides
nothing itself.

Coverage is gated: 70% globally, and 90% on the parts a screenshot cannot check — the event fold,
the pacing queue, the meld layout, and the mapping from `prompt.options` to buttons.

**The seed verifier is checked against the server, twice.** `features/replay/verify-seed.ts` is a
deliberate second implementation of the engine's wall derivation — a verifier sharing code with the
thing it verifies would prove only self-consistency. `verify-seed.spec.ts` pins it to golden values
the backend engine produced, and `around-the-game.spec.ts` presses the button in a real browser
against `test-fixtures/replay.json`, a whole game the backend engine actually dealt and publishes
through `emit:fixtures`.

## Assets

Everything visual is listed in [`ASSETS.md`](ASSETS.md) with its origin and licence, and an asset in
the tree with no row there is a release blocker rather than a to-do.

Two tile face sets, sourced differently on purpose:

- **`traditional`** is CC0 art from
  [fluffystuff/riichi-mahjong-tiles](https://github.com/fluffystuff/riichi-mahjong-tiles), vendored
  unmodified in [`vendor/`](vendor/riichi-mahjong-tiles/) with its licence and provenance.
  `npm run build:tiles` assembles those 38 files into `public/tiles/traditional.svg`, which is
  committed and drift-checked by `check:tiles` in CI; the app fetches it once. A face file is the
  design alone on a transparent ground — the slab under it is the CSS tile body — while `Back.svg`
  is a complete tile and draws its own.
- **`high-contrast`** is first-party geometry in `shared/tiles/tile-faces.ts`, injected inline. It is
  both the low-vision set and the fallback: if the sheet cannot be fetched the board renders this
  rather than 136 blank slabs, which is why it must not depend on a fetch of its own.

Replacing the traditional art — a commission, say — means replacing the vendored files and
re-running `build:tiles`, not touching the components.
