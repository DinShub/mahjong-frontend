import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, STORAGE_KEY } from '@core/settings/settings.service';

import { DEFAULT_LOCALE, isLocale, storedLocale } from './locale';
import { catalogueFor } from './messages';

/**
 * The locale is read twice from the same key — once before Angular exists, once by the settings
 * service — and the two must not drift. These tests pin the shape of that shared read.
 */
describe('storedLocale', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  afterEach(() => {
    globalThis.localStorage?.clear();
  });

  it('defaults when nothing is stored', () => {
    expect(storedLocale()).toBe(DEFAULT_LOCALE);
  });

  it('reads the same key the settings service writes', () => {
    // Not a hand-written blob: the point is that a document the settings service would actually
    // produce is one this can read, which a differently-shaped fixture would not prove.
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, locale: 'ja' }),
    );
    expect(storedLocale()).toBe('ja');
  });

  it('falls back rather than trusting a stored value it does not recognise', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ locale: 'kl' }));
    expect(storedLocale()).toBe(DEFAULT_LOCALE);

    globalThis.localStorage.setItem(STORAGE_KEY, 'not json');
    expect(storedLocale()).toBe(DEFAULT_LOCALE);
  });

  it('recognises exactly the two locales that ship', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ja')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('catalogues', () => {
  it('has none for the source locale', () => {
    // English is the source text `$localize` already holds; an identity catalogue would be a
    // second copy of every string to keep in step with the templates.
    expect(catalogueFor('en')).toBeNull();
  });

  it('translates the strings the M5 screens use', () => {
    const ja = catalogueFor('ja');
    expect(ja).not.toBeNull();
    for (const id of [
      'settings.title',
      'profile.placements',
      'profile.winRate',
      'replay.allRevealed',
      'settings.language',
    ]) {
      expect(ja?.[id], id).toBeTypeOf('string');
    }
  });

  it('is keyed by explicit message ids, not by source text', () => {
    // The whole file depends on this. `$localize` derives an id from a *hash* of the source text
    // unless one is given, so a catalogue keyed by the English sentence translates nothing at all —
    // silently. Every key here has to be an id someone wrote as `@@…` in a template.
    for (const id of Object.keys(catalogueFor('ja') ?? {})) {
      expect(id, id).toMatch(/^[a-z][a-zA-Z]*\.[a-zA-Z]+$/);
    }
  });

  it('translates nothing to the empty string', () => {
    // An empty translation renders as a blank label, which is worse than the untranslated word.
    for (const [key, value] of Object.entries(catalogueFor('ja') ?? {})) {
      expect(value.length, key).toBeGreaterThan(0);
    }
  });
});
