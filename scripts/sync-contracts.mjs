/**
 * Copy the backend's published contract into `src/app/core/contracts/`.
 *
 *   npm run sync:contracts                    # from ../backend
 *   npm run sync:contracts -- --backend ../../backend
 *   npm run check:contracts                   # verify, change nothing (CI)
 *
 * The backend owns `src/contracts/**` and publishes it with `npm run emit:contracts`
 * (docs/02-architecture.md §Repository layout). Nothing here is hand-edited — ever.
 *
 * `--check` has two modes so it is useful in both places:
 *
 * - Backend available  → compares the synced copy against `dist-contracts/`, i.e. real drift.
 * - Backend absent     → re-hashes the synced files and compares them to the manifest recorded at
 *                        sync time, which catches local edits to files marked DO NOT EDIT.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const target = path.join(repoRoot, 'src', 'app', 'core', 'contracts');

const args = process.argv.slice(2);
const check = args.includes('--check');
const backendArg = args.indexOf('--backend');
const backendRoot = path.resolve(
  repoRoot,
  backendArg >= 0
    ? (args[backendArg + 1] ?? '../backend')
    : (process.env.BACKEND_PATH ?? '../backend'),
);
const published = path.join(backendRoot, 'dist-contracts');

const BANNER = `# core/contracts — GENERATED, DO NOT EDIT

Synced from the backend repo with \`npm run sync:contracts\`. The backend's \`src/contracts/\` is the
source of truth for every type, zod schema and constant that crosses the wire.

To change the protocol: edit it in the backend, run \`npm run emit:contracts\` there, commit
\`dist-contracts/\`, then re-run \`npm run sync:contracts\` here and commit the result.

\`npm run check:contracts\` fails if these files were hand-edited or have fallen behind the backend.
`;

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function hashSyncedFiles(dir) {
  if (!existsSync(dir)) return {};
  const entries = await readdir(dir, { withFileTypes: true });
  const hashes = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    if (entry.name === 'manifest.json' || entry.name === 'README.md') continue;
    hashes[entry.name] = sha256(await readFile(path.join(dir, entry.name)));
  }
  return hashes;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`sync:contracts — ${message}`);
  process.exitCode = 1;
}

async function collectFromBackend() {
  const manifest = await readJson(path.join(published, 'manifest.json'));
  if (manifest === null) {
    fail(
      `no contract found at ${path.relative(repoRoot, published)}.\n` +
        '  Run `npm run emit:contracts` in the backend repo, or pass --backend <path>.',
    );
    return null;
  }

  const sourceDir = path.join(published, 'src');
  const names = (await readdir(sourceDir)).filter((name) => name.endsWith('.ts')).sort();
  return { manifest, sourceDir, names };
}

async function sync() {
  const collected = await collectFromBackend();
  if (collected === null) return;
  const { manifest, sourceDir, names } = collected;

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  for (const name of names) {
    await copyFile(path.join(sourceDir, name), path.join(target, name));
  }
  await copyFile(path.join(published, 'schemas.json'), path.join(target, 'schemas.json'));
  await writeFile(path.join(target, 'README.md'), BANNER, 'utf8');

  const files = await hashSyncedFiles(target);
  await writeFile(
    path.join(target, 'manifest.json'),
    `${JSON.stringify({ protocolVersion: manifest.protocolVersion, contractsHash: manifest.contractsHash, files }, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `synced ${names.length} contract modules (protocol v${manifest.protocolVersion}, hash ${String(manifest.contractsHash).slice(0, 12)}…)`,
  );
}

async function verify() {
  const local = await readJson(path.join(target, 'manifest.json'));
  if (local === null) {
    fail('src/app/core/contracts/manifest.json is missing. Run: npm run sync:contracts');
    return;
  }

  const actual = await hashSyncedFiles(target);
  const expected = local.files ?? {};
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  const edited = names.filter((name) => expected[name] !== actual[name]);
  if (edited.length > 0) {
    fail(
      'the synced contract has been modified locally — it is generated:\n' +
        edited.map((name) => `  edited  ${name}`).join('\n') +
        '\n  Run: npm run sync:contracts',
    );
    return;
  }

  if (!existsSync(published)) {
    console.log(
      `contracts intact (protocol v${local.protocolVersion}, hash ${String(local.contractsHash).slice(0, 12)}…); ` +
        `backend not present at ${path.relative(repoRoot, backendRoot)}, so drift against it was not checked`,
    );
    return;
  }

  const upstream = await readJson(path.join(published, 'manifest.json'));
  if (upstream === null) {
    fail(
      `no manifest in ${path.relative(repoRoot, published)}. Run \`npm run emit:contracts\` in the backend.`,
    );
    return;
  }
  if (upstream.contractsHash !== local.contractsHash) {
    fail(
      `contracts are behind the backend.\n  backend: ${String(upstream.contractsHash).slice(0, 12)}…\n` +
        `  here:    ${String(local.contractsHash).slice(0, 12)}…\n  Run: npm run sync:contracts`,
    );
    return;
  }

  console.log(`contracts match the backend (protocol v${local.protocolVersion})`);
}

await (check ? verify() : sync());
