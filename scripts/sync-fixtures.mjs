/**
 * Copy the backend's published wire fixtures into `test-fixtures/`.
 *
 *   npm run sync:fixtures                     # from ../backend
 *   npm run sync:fixtures -- --backend ../../backend
 *   npm run check:fixtures                    # verify, change nothing (CI)
 *
 * `docs/07-frontend.md` §9: the mock socket server replays canned `GameEvent[]` fixtures — *"the
 * same fixtures the backend engine tests produce, so FE and BE are tested against literally the
 * same data."* The backend publishes them with `npm run emit:fixtures`; nothing here is ever
 * hand-edited, for the same reason `core/contracts/` is not.
 *
 * Same two `--check` modes as `sync-contracts.mjs`: against the backend when it is present, and
 * against the recorded manifest when it is not.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const target = path.join(repoRoot, 'test-fixtures');

const args = process.argv.slice(2);
const check = args.includes('--check');
const backendArg = args.indexOf('--backend');
const backendRoot = path.resolve(
  repoRoot,
  backendArg >= 0
    ? (args[backendArg + 1] ?? '../backend')
    : (process.env.BACKEND_PATH ?? '../backend'),
);
const published = path.join(backendRoot, 'dist-fixtures');

const BANNER = `# test-fixtures — GENERATED, DO NOT EDIT

Wire-form recordings of real games, synced from the backend with \`npm run sync:fixtures\`.

Each file is one hand from \`backend/test/bots/fixtures/\` — a rare situation the M2 soak found —
replayed through the engine and projected for a single seat:

- \`snapshot\` — the \`PlayerView\` the client would receive on joining, at the start of the hand.
- \`steps\`    — the projected events in order, with the prompts that seat was offered interleaved
                at the points it had to decide, and the answer it gave.
- \`final\`    — the \`PlayerView\` after the last action.

\`final\` is what makes these worth having: the client's event fold is checked against the engine's
own state rather than against a literal somebody typed. The engine producing it is the one held to
the 12 009-hand conformance gate.

To change them: regenerate in the backend with \`npm run emit:fixtures\`, commit \`dist-fixtures/\`,
then re-run \`npm run sync:fixtures\` here.
`;

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function hashDir(dir, skip = new Set()) {
  if (!existsSync(dir)) return {};
  const entries = await readdir(dir, { withFileTypes: true });
  const hashes = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || skip.has(entry.name)) continue;
    hashes[entry.name] = sha256(await readFile(path.join(dir, entry.name)));
  }
  return hashes;
}

function report(expected, actual) {
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const problems = [];
  for (const name of [...names].sort()) {
    if (expected[name] === undefined) problems.push(`${name}: not published by the backend`);
    else if (actual[name] === undefined) problems.push(`${name}: missing`);
    else if (expected[name] !== actual[name]) problems.push(`${name}: differs`);
  }
  return problems;
}

const SKIP = new Set(['README.md']);

async function main() {
  const backendAvailable = existsSync(published);

  if (check && !backendAvailable) {
    // No backend: re-hash what is here and hold it to the manifest recorded at sync time. That
    // catches a hand-edited fixture, which is the failure this mode exists for.
    const manifestPath = path.join(target, 'manifest.json');
    if (!existsSync(manifestPath)) {
      console.error('test-fixtures/manifest.json is missing; run `npm run sync:fixtures`');
      process.exit(1);
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const actual = await hashDir(target, new Set([...SKIP, 'manifest.json']));
    const problems = report(manifest.files ?? {}, actual);
    if (problems.length > 0) {
      console.error('test-fixtures has been edited by hand:');
      for (const problem of problems) console.error(`  ${problem}`);
      process.exit(1);
    }
    console.log(`test-fixtures matches its manifest (${Object.keys(actual).length} files)`);
    return;
  }

  if (!backendAvailable) {
    console.error(`no published fixtures at ${published}`);
    console.error('run `npm run emit:fixtures` in the backend first');
    process.exit(1);
  }

  const source = await hashDir(published);
  if (check) {
    const actual = await hashDir(target, SKIP);
    const problems = report(source, actual);
    if (problems.length > 0) {
      console.error('test-fixtures has drifted from the backend:');
      for (const problem of problems) console.error(`  ${problem}`);
      console.error('run `npm run sync:fixtures`');
      process.exit(1);
    }
    console.log(`test-fixtures is in sync (${Object.keys(source).length} files)`);
    return;
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const name of Object.keys(source)) {
    await copyFile(path.join(published, name), path.join(target, name));
  }
  await writeFile(path.join(target, 'README.md'), BANNER, 'utf8');
  console.log(`synced ${Object.keys(source).length} fixtures into test-fixtures/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
