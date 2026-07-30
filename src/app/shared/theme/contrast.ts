/** WCAG 2.1 relative luminance and contrast ratio. Used by the theme audit. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(value: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (match === null) return null;
  const hex = match[1]!;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function luminance(colour: Rgb): number {
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA: 4.5 for body text, 3 for large text and for UI boundaries and graphics. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
