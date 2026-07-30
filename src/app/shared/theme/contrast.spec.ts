import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA_LARGE, AA_TEXT, contrastRatio, parseHex } from './contrast';

/**
 * The contrast audit, as a test rather than a one-off spreadsheet.
 *
 * `docs/07-frontend.md` §7 targets WCAG AA against the table felt, and the backlog lists a
 * "contrast audit vs both themes" as an M4 item. Doing it by eye once is how a palette passes on
 * the day it is checked and fails three commits later, when a token is nudged a shade to look
 * nicer. These are the pairs that actually appear on screen, and both themes must satisfy them.
 */

const THEMES = ['classic-green', 'dark'] as const;

function tokensOf(theme: string): Record<string, string> {
  const css = readFileSync(join(process.cwd(), 'src', 'styles.scss'), 'utf8');
  const selector =
    theme === 'classic-green' ? ':root,\\s*\\n\\.theme-classic-green' : '\\.theme-dark';
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  expect(block, `no token block for ${theme}`).not.toBeNull();

  const tokens: Record<string, string> = {};
  for (const [, name, value] of block![1]!.matchAll(/(--mj-[\w-]+):\s*([^;]+);/g)) {
    tokens[name!] = value!.trim();
  }
  return tokens;
}

interface Pair {
  foreground: string;
  background: string;
  minimum: number;
  what: string;
}

/** Everything a player has to read, and every boundary they have to see. */
const PAIRS: Pair[] = [
  { foreground: '--mj-text', background: '--mj-felt', minimum: AA_TEXT, what: 'text on the felt' },
  {
    foreground: '--mj-text',
    background: '--mj-felt-edge',
    minimum: AA_TEXT,
    what: 'text on the table edge',
  },
  {
    foreground: '--mj-text',
    background: '--mj-surface',
    minimum: AA_TEXT,
    what: 'text on a panel',
  },
  {
    foreground: '--mj-text',
    background: '--mj-surface-raised',
    minimum: AA_TEXT,
    what: 'button text',
  },
  {
    foreground: '--mj-text-muted',
    background: '--mj-surface',
    minimum: AA_TEXT,
    what: 'secondary text on a panel',
  },
  {
    foreground: '--mj-text-muted',
    background: '--mj-felt',
    minimum: AA_TEXT,
    what: 'secondary text on the felt',
  },
  {
    foreground: '--mj-text-muted',
    background: '--mj-felt-edge',
    minimum: AA_TEXT,
    what: 'secondary text on the table edge',
  },
  {
    foreground: '--mj-accent-ink',
    background: '--mj-accent',
    minimum: AA_TEXT,
    what: 'text on the primary button',
  },
  {
    foreground: '--mj-tile-ink',
    background: '--mj-tile-body',
    minimum: AA_TEXT,
    what: 'tile face ink',
  },
  {
    foreground: '--mj-danger',
    background: '--mj-surface',
    minimum: AA_TEXT,
    what: 'an error message',
  },
  {
    foreground: '--mj-danger',
    background: '--mj-felt',
    minimum: AA_TEXT,
    what: 'an error message on the felt',
  },
  {
    foreground: '--mj-ok',
    background: '--mj-surface',
    minimum: AA_TEXT,
    what: 'a positive score change',
  },

  // Boundaries and graphical objects: AA asks for 3:1, not 4.5.
  {
    foreground: '--mj-line',
    background: '--mj-surface',
    minimum: AA_LARGE,
    what: 'a panel border',
  },
  {
    foreground: '--mj-line',
    background: '--mj-felt',
    minimum: AA_LARGE,
    what: 'a border on the felt',
  },
  { foreground: '--mj-accent', background: '--mj-felt', minimum: AA_LARGE, what: 'the turn ring' },
  {
    foreground: '--mj-turn-ring',
    background: '--mj-felt-edge',
    minimum: AA_LARGE,
    what: 'the turn ring on a nameplate',
  },
  {
    foreground: '--mj-riichi-accent',
    background: '--mj-felt',
    minimum: AA_LARGE,
    what: 'the riichi marker',
  },
  {
    foreground: '--mj-riichi-stick',
    background: '--mj-felt',
    minimum: AA_LARGE,
    what: 'a riichi stick on the table',
  },
  {
    foreground: '--mj-face-red',
    background: '--mj-tile-body',
    minimum: AA_LARGE,
    what: 'a red five',
  },
  { foreground: '--mj-face-green', background: '--mj-tile-body', minimum: AA_LARGE, what: 'hatsu' },
  {
    foreground: '--mj-face-blue',
    background: '--mj-tile-body',
    minimum: AA_LARGE,
    what: 'a pin ring',
  },
  {
    foreground: '--mj-hc-man',
    background: '--mj-tile-body',
    minimum: AA_TEXT,
    what: 'a high-contrast man numeral',
  },
  {
    foreground: '--mj-hc-pin',
    background: '--mj-tile-body',
    minimum: AA_TEXT,
    what: 'a high-contrast pin numeral',
  },
  {
    foreground: '--mj-hc-sou',
    background: '--mj-tile-body',
    minimum: AA_TEXT,
    what: 'a high-contrast sou numeral',
  },
  {
    foreground: '--mj-tile-body',
    background: '--mj-felt',
    minimum: AA_LARGE,
    what: 'a tile against the felt',
  },
  {
    foreground: '--mj-tile-back',
    background: '--mj-felt',
    minimum: AA_LARGE,
    what: "an opponent's tile back",
  },
];

describe('theme contrast', () => {
  for (const theme of THEMES) {
    describe(theme, () => {
      const tokens = tokensOf(theme);

      it('defines every token the components reference', () => {
        const referenced = new Set(PAIRS.flatMap((pair) => [pair.foreground, pair.background]));
        for (const name of referenced) {
          expect(tokens[name], `${name} is missing from ${theme}`).toBeDefined();
        }
      });

      for (const pair of PAIRS) {
        it(`${pair.what} meets ${String(pair.minimum)}:1`, () => {
          const foreground = parseHex(tokens[pair.foreground] ?? '');
          const background = parseHex(tokens[pair.background] ?? '');
          expect(foreground, `${pair.foreground} is not a hex colour`).not.toBeNull();
          expect(background, `${pair.background} is not a hex colour`).not.toBeNull();

          const ratio = contrastRatio(foreground!, background!);
          expect(
            Math.round(ratio * 100) / 100,
            `${pair.foreground} on ${pair.background} in ${theme}`,
          ).toBeGreaterThanOrEqual(pair.minimum);
        });
      }
    });
  }

  it('computes the reference ratios correctly', () => {
    expect(contrastRatio(parseHex('#000')!, parseHex('#fff')!)).toBeCloseTo(21, 5);
    expect(contrastRatio(parseHex('#fff')!, parseHex('#fff')!)).toBeCloseTo(1, 5);
  });
});
