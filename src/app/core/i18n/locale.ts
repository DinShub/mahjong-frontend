import { loadTranslations } from '@angular/localize';

import { catalogueFor } from './messages';
import type { Locale } from './messages';

export type { Locale };

/**
 * Where the chosen locale is read from **before Angular exists**.
 *
 * `loadTranslations()` has to run before `bootstrapApplication`, and at that point there is no
 * injector, so the settings service cannot be asked. Both read the same `localStorage` key; this
 * is a deliberate, one-directional duplication of the *read*, and the key is defined once in
 * `settings.service.ts` and imported here so the two cannot drift apart on the name.
 */
export const STORAGE_KEY = 'mj.settings.v1';

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ja';
}

/** The stored locale, or the default. Never throws — private browsing has no storage. */
export function storedLocale(): Locale {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_LOCALE;
    const parsed = JSON.parse(raw) as { locale?: unknown };
    return isLocale(parsed.locale) ? parsed.locale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Install the translations for `locale` and tell the platform which one is active.
 *
 * Called from `main.ts` before bootstrap. `$localize` is a global installed by
 * `@angular/localize/init`; `loadTranslations` fills its table. Loading nothing is the correct
 * behaviour for English — the source text *is* the English text, and an identity catalogue would be
 * a second copy of every string to keep in step.
 *
 * `document.documentElement.lang` is set alongside, because it is what a screen reader switches
 * voice on and what `:lang()` selectors match — a page translated into Japanese while still
 * claiming `lang="en"` is read aloud in the wrong language.
 */
export function installLocale(locale: Locale = storedLocale()): Locale {
  const catalogue = catalogueFor(locale);
  if (catalogue !== null) loadTranslations(catalogue);
  const root = globalThis.document?.documentElement;
  if (root !== undefined) root.lang = locale;
  return locale;
}
