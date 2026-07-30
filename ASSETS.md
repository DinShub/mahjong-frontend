# Assets and licences

Every visual and audio asset the client ships is listed here with its origin and licence. Nothing
ships without an entry. `docs/08-graphics-ux.md` §3 makes this a release blocker, and the launch
checklist in `tasks/backlog.md` ticks against this file.

The rule: **no "found it on GitHub" assets.** An asset whose licence has not been read is treated as
unusable, not as usable-until-someone-complains.

---

## Tile faces

| Asset                                 | Origin                                                                                              | Licence                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| `traditional` face set (37 + back)    | [fluffystuff/riichi-mahjong-tiles](https://github.com/fluffystuff/riichi-mahjong-tiles), `Regular/` | **CC0 1.0 / public domain** |
| `high-contrast` face set (37 symbols) | This repository, drawn as geometry                                                                  | Project-owned (first party) |

### `traditional` — vendored, CC0

Upstream's own licence statement, verbatim:

> This work is in the public domain. For more information, visit
> https://creativecommons.org/publicdomain/zero/1.0/.

Read from [`LICENSE.md`](vendor/riichi-mahjong-tiles/LICENSE.md) in the repository itself, not from a
third-party summary, and reproduced in the vendored copy alongside the files. CC0 waives copyright
and requires no attribution; the credit above is courtesy, and it stays regardless.

- **Vendored, unmodified**, at [`vendor/riichi-mahjong-tiles/`](vendor/riichi-mahjong-tiles/) —
  38 SVGs (37 faces + the tile back) from the `Regular/` variant, plus the upstream licence and
  README. Provenance, including the branch and the date fetched, is in
  [`PROVENANCE.md`](vendor/riichi-mahjong-tiles/PROVENANCE.md).
- **Shipped as one sprite sheet**, `public/tiles/traditional.svg`, generated from those files by
  `npm run build:tiles` and committed. `npm run check:tiles` fails if it has drifted from the
  vendored input, the same rule the contract and the test fixtures get.
- **One request, 284 kB raw / ~22 kB gzipped.** Fetched rather than inlined into the JS bundle:
  that is `docs/08` §3's _"a single request"_, it keeps the art out of the app's cache key, and
  22 kB against a 350 kB budget is not worth arguing about.

Each face file draws **the design alone, on a transparent ground**. The slab it belongs on is a
separate upstream file, `Front.svg`, which is deliberately not vendored: the CSS tile body _is_ that
slab, so this set keeps §3's _"tile body is CSS, not part of the SVG"_ exactly as written, and the
body still themes independently of the face.

`Back.svg` is the one exception — that file is a complete tile, so `<mj-tile>` stands its own body
down for the face-down variant and lets the art draw it. That is why the "does the art include the
body" flag is per symbol rather than per set: asserting it of the whole set is what once shipped a
board of painted designs lying on the felt with no tiles under them.

### `high-contrast` — first party, inline

Source: [`src/app/shared/tiles/tile-faces.ts`](src/app/shared/tiles/tile-faces.ts). A large numeral
and a suit letter, built from rectangles and text at build time, so there is no file and no licence
question.

It exists for the reason §3 gives — _"larger, simplified numerals — critical for readability at pond
size and for low-vision players"_ — and it is also the **fallback**: if the traditional sheet cannot
be fetched, `<mj-tile>` renders this set rather than 136 blank slabs. That is why it stays inline and
first-party. A fallback that depends on a network request is not a fallback.

## Fonts

| Asset   | Origin                               | Licence                         |
| ------- | ------------------------------------ | ------------------------------- |
| UI text | `system-ui` / platform default stack | N/A — no font files are shipped |

No webfont is bundled or fetched. The stack in `styles.scss` names only fonts already on the user's
device, so there is no font request on the critical path.

The high-contrast tile set draws Latin digits and letters with `<text>` in that same stack. Those
glyphs exist on every platform this app targets. **Nothing draws a CJK glyph with a font** — a
headless CI image frequently has no CJK font at all, and tofu boxes render as a _passing_ screenshot
test until a human looks. The kanji come from the vendored art instead.

## Sound

None yet. Sound is M5, and open decision 8 — _"voice clips: record vs license"_ — defaults to **ship
silent**. Each clip gets a row here before it is committed, under the same rule as the tiles.

## Icons and images

None. Every glyph in the interface is text or an inline SVG drawn in a component. `favicon.ico` is a
placeholder from the Angular CLI scaffold.

---

## Adding an asset

1. Read the licence **before** committing the file, from the source itself. Keep a copy of the
   licence text in the repository next to the asset.
2. Vendor it. A remote URL is not an option: the board must render offline and under a strict CSP.
3. Add a row to the relevant table above, naming the upstream and the commit or release it came
   from.
4. If attribution is required, add it to the credits in the settings screen (M5) as well as here.

An asset in the tree with no row here is a release blocker, not a to-do.
