# core/contracts — GENERATED, DO NOT EDIT

Synced from the backend repo with `npm run sync:contracts`. The backend's `src/contracts/` is the
source of truth for every type, zod schema and constant that crosses the wire.

To change the protocol: edit it in the backend, run `npm run emit:contracts` there, commit
`dist-contracts/`, then re-run `npm run sync:contracts` here and commit the result.

`npm run check:contracts` fails if these files were hand-edited or have fallen behind the backend.
