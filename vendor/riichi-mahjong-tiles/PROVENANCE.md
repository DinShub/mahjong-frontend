# riichi-mahjong-tiles — vendored, unmodified

|                |                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Upstream       | https://github.com/fluffystuff/riichi-mahjong-tiles                                             |
| Branch fetched | `master`                                                                                        |
| Files dated    | 2024-06-15                                                                                      |
| Fetched        | 2026-07-29                                                                                      |
| Licence        | **CC0 1.0 / public domain** — see [`LICENSE.md`](LICENSE.md), reproduced from upstream verbatim |
| Variant used   | `Regular/`                                                                                      |

The upstream licence statement, in full:

> This work is in the public domain. For more information, visit
> https://creativecommons.org/publicdomain/zero/1.0/.

and from the README:

> All assets are in the [public domain](https://creativecommons.org/publicdomain/zero/1.0/).

CC0 waives copyright and imposes no attribution requirement. The attribution in
[`../../ASSETS.md`](../../ASSETS.md) is therefore courtesy, not obligation — and it stays either way,
because "where did this come from" is a question someone will ask.

## What is here

The 37 faces this game needs, plus the tile back:

- `Man1`–`Man9`, `Pin1`–`Pin9`, `Sou1`–`Sou9` — the numbered suits
- `Man5-Dora`, `Pin5-Dora`, `Sou5-Dora` — the red fives
- `Ton`, `Nan`, `Shaa`, `Pei` — the four winds
- `Haku`, `Hatsu`, `Chun` — the three dragons
- `Back` — the face-down tile

Not taken: `Front.svg` and `Blank.svg` (the bare slab, which the client draws in CSS instead — see
below), the `Black/` variant, and the PNG exports under `Export/`.

**These files are unmodified.** They are Inkscape output, complete with editor metadata, and they are
kept that way so that "is this what upstream published?" is answerable by comparing bytes. The
shipped artefact is generated from them by `npm run build:tiles` and is a separate file —
`public/tiles/traditional.svg`.

## A face is a design, not a whole tile

Every face SVG here contains **only the design**, on a transparent ground: no slab, no edge, no
shading. Upstream draws those once, in `Front.svg`, and expects a face to be composited over it.

This document previously claimed the opposite, and the claim was load-bearing — the client stood its
own CSS slab down for this set on the strength of it, and shipped a board of designs painted
directly on the felt. Checked before rewriting: `Man1.svg` and its siblings contain the design's
colours and nothing else (the one `<rect>` in each is an Inkscape swatch parked outside the
viewBox), while `Back.svg` fills the full 300 × 400.

So, for this set:

- **Faces** are drawn over the client's CSS tile body, which is `docs/08-graphics-ux.md` §3's
  arrangement and keeps body and face themeable apart.
- **`Back.svg` is a complete tile** — it is the exception, and the face-down variant lets the art
  draw the body.

If a future set does draw whole tiles, the client already supports it per symbol; nothing here has
to change but the flag.
