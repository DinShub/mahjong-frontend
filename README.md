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
npm start                # http://localhost:4200
```

With the backend running (`npm run dev` in `../backend`), the landing page says **Connected** after
a real socket handshake.

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

## Layout

```
src/app/
├── core/
│   ├── contracts/   synced from the backend — DO NOT EDIT
│   ├── config/      environment handling, APP_CONFIG
│   ├── socket/      typed socket.io wrapper
│   └── auth/        token storage, refresh interceptor          [M3]
├── features/
│   ├── landing/     connection status; becomes play-as-guest/login in M4
│   └── lobby/ table/ game/ replay/ profile/                     [M4/M5]
└── shared/                                                      [M4]
```

### The contract is generated

`src/app/core/contracts/` is copied from the backend's `dist-contracts/` and is never edited here.
It carries the types, the zod schemas and the constants (`PROTOCOL_VERSION`, tile helpers) — both
sides validate with the same schemas, so a protocol mismatch is a typed error rather than
`undefined` three layers deep.

```bash
npm run sync:contracts -- --backend ../path/to/backend
npm run check:contracts        # CI: fails on hand-edits and on drift
```

## Environments

`src/environments/environment*.ts` hold the only values that vary: `apiUrl` and `socketUrl`.

| Configuration           | Points at                                                           |
| ----------------------- | ------------------------------------------------------------------- |
| `development` (default) | `http://localhost:3000` — a locally running backend                 |
| `production`            | same origin (empty strings): the static host proxies to the backend |
| `e2e`                   | `http://127.0.0.1:3100` — the Playwright mock socket server         |

The protocol version is **not** an environment value: it comes from the synced contract.

## Testing

| Level            | Where              | Notes                                                                      |
| ---------------- | ------------------ | -------------------------------------------------------------------------- |
| Unit / component | `src/**/*.spec.ts` | vitest + jsdom; TestBed works normally                                     |
| E2E              | `e2e/*.spec.ts`    | Playwright vs `e2e/support/mock-socket-server.mjs`, never the real backend |

The e2e run starts its own app server on :4300 and its own mock on :3100 and never reuses an
existing server, so it cannot accidentally test whatever else happens to be listening on :4200.

The mock server speaks the same contract as the gateway (handshake validation, `session:hello`).
From M4 it also replays canned `GameEvent[]` fixtures — the same fixtures the backend's engine tests
produce, so both sides are tested against literally the same data.
