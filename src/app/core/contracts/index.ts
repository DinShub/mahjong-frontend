/**
 * The FE/BE contract — the single source of truth for everything that crosses the wire.
 *
 * `npm run emit:contracts` publishes this folder to `dist-contracts/`, and the frontend's
 * `npm run sync:contracts` copies it into `src/app/core/contracts/`. CI on both sides fails if
 * the two drift (`docs/02-architecture.md` §Repository layout).
 *
 * Rules for this folder:
 * - zod is the only permitted runtime dependency (lint-enforced).
 * - It imports nothing from `modules/`, `infra/` or `engine/`.
 * - If something is hard to keep here, that is a signal it does not belong on the wire.
 */

export * from './tiles.js';
export * from './actions.js';
export * from './views.js';
export * from './protocol.js';
export * from './project.js';
export * from './auth.js';
export * from './stats.js';
export * from './schemas.js';
