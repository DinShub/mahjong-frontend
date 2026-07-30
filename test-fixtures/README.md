# test-fixtures — GENERATED, DO NOT EDIT

Wire-form recordings of real games, synced from the backend with `npm run sync:fixtures`.

Each file is one hand from `backend/test/bots/fixtures/` — a rare situation the M2 soak found —
replayed through the engine and projected for a single seat:

- `snapshot` — the `PlayerView` the client would receive on joining, at the start of the hand.
- `steps`    — the projected events in order, with the prompts that seat was offered interleaved
                at the points it had to decide, and the answer it gave.
- `final`    — the `PlayerView` after the last action.

`final` is what makes these worth having: the client's event fold is checked against the engine's
own state rather than against a literal somebody typed. The engine producing it is the one held to
the 12 009-hand conformance gate.

To change them: regenerate in the backend with `npm run emit:fixtures`, commit `dist-fixtures/`,
then re-run `npm run sync:fixtures` here.
