import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Action, GameEvent, Seat } from '@contracts/actions';
import type { PlayerView } from '@contracts/views';

/**
 * Loading the wire fixtures synced from the backend.
 *
 * Test-only, and read from disk rather than `import`ed: a JSON import would drag forty thousand
 * lines of inferred literal types through `tsc` for no benefit, and these are never part of the
 * application bundle.
 */

export interface FixtureEventStep {
  t: 'event';
  seq: number;
  event: GameEvent;
}

export interface FixturePromptStep {
  t: 'prompt';
  options: Action[];
  answer: Action;
}

export type FixtureStep = FixtureEventStep | FixturePromptStep;

export interface WireFixture {
  situation: string;
  note: string;
  seed: string;
  handIndex: number;
  mySeat: Seat;
  /** The view a client is sent when it joins, at the start of the hand. */
  snapshot: PlayerView;
  steps: FixtureStep[];
  /** The engine's own view after the last action — the reference the client's fold is held to. */
  final: PlayerView;
}

/** vitest and Playwright both run from the repository root. */
const FIXTURE_DIR = join(process.cwd(), 'test-fixtures');

export function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}

export function loadFixture(name: string): WireFixture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')) as WireFixture;
}

export function loadAllFixtures(): WireFixture[] {
  return fixtureNames().map(loadFixture);
}

export function eventsOf(fixture: WireFixture): FixtureEventStep[] {
  return fixture.steps.filter((step): step is FixtureEventStep => step.t === 'event');
}

export function promptsOf(fixture: WireFixture): FixturePromptStep[] {
  return fixture.steps.filter((step): step is FixturePromptStep => step.t === 'prompt');
}
