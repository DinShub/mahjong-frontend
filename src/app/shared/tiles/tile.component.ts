import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { isRedTileStr } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';

import { SettingsService } from '@core/settings/settings.service';

import { FALLBACK_TILE_SET, TILE_SET_INFO, backSymbolId, faceSymbolId } from './tile-faces';
import type { TileSet } from './tile-faces';
import { FACE_DOWN_LABEL, tileName } from './tile-names';
import { TileSpriteService } from './tile-sprite.service';

/** Nominal sizes in stage units (`docs/08-graphics-ux.md` §3). */
export type TileSize = 'hand' | 'meld' | 'pond' | 'opponent' | 'tiny';

/**
 * One tile.
 *
 * The *body* — the ivory slab, its edge, its shadow — is CSS, and the *face* is an SVG `<use>`, so
 * the two theme independently and a face-down tile is this same component with no face at all
 * (`docs/08-graphics-ux.md` §3). That split is also what makes the whole render layer swappable:
 * positions are computed as plain data by the parents, and this leaf is the only thing that knows
 * what a tile looks like.
 */
@Component({
  selector: 'mj-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /**
   * Individual class bindings, not one `[class]` string.
   *
   * A host `[class]="someString"` binding takes ownership of the element's class list, which
   * silently drops the `[class.riichi]` and `[class.drawn]` bindings the *parents* put on this
   * element — the pond's rotated riichi discard and the hand's detached drawn tile both stop
   * rendering, and nothing errors. Found by an end-to-end test looking for a rotated discard that
   * was there in the state and not in the DOM.
   */
  host: {
    class: 'mj-tile',
    '[class.back]': 'tile() === null',
    '[class.whole-tile]': 'wholeTile()',
    '[class.red]': 'isRed()',
    '[class.suit-colour]': 'suitColour()',
    '[class.rotated]': 'rotated()',
    '[class.selected]': 'selected()',
    '[class.disabled]': 'disabled()',
    '[class.dimmed]': 'dimmed()',
    '[class.interactive]': 'interactive()',
    '[attr.data-suit]': 'suit()',
    '[attr.data-size]': 'size()',
    '[attr.role]': 'interactive() ? "button" : "img"',
    '[attr.aria-label]': 'label()',
    '[attr.aria-disabled]': 'interactive() && disabled() ? "true" : null',
    '[attr.tabindex]': 'interactive() && !disabled() ? 0 : null',
    '[attr.data-tile]': 'tile() ?? "back"',
    '[attr.data-testid]': 'testId()',
  },
  template: `
    @if (hasSymbol()) {
      <svg
        class="face"
        [attr.viewBox]="viewBox()"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <use [attr.href]="'#' + symbolId()"></use>
      </svg>
    }
    @if (marker()) {
      <span class="marker" aria-hidden="true"></span>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      width: var(--tile-w);
      height: var(--tile-h);
      border-radius: calc(var(--tile-w) * 0.11);
      background: linear-gradient(
        170deg,
        var(--mj-tile-body-hi) 0%,
        var(--mj-tile-body) 42%,
        var(--mj-tile-body-lo) 100%
      );
      border: 1px solid var(--mj-tile-edge);
      box-shadow:
        0 1px 0 var(--mj-tile-body-hi) inset,
        0 calc(var(--tile-w) * 0.06) 0 var(--mj-tile-side),
        0 calc(var(--tile-w) * 0.09) calc(var(--tile-w) * 0.1) rgb(0 0 0 / 35%);
      color: var(--mj-tile-ink);
      flex: none;
      user-select: none;
      -webkit-user-select: none;
    }

    :host([data-size='hand']) {
      --tile-w: 44px;
      --tile-h: 60px;
    }
    :host([data-size='meld']) {
      --tile-w: 34px;
      --tile-h: 46px;
    }
    :host([data-size='pond']) {
      --tile-w: 30px;
      --tile-h: 41px;
    }
    :host([data-size='opponent']) {
      --tile-w: 26px;
      --tile-h: 36px;
    }
    :host([data-size='tiny']) {
      --tile-w: 20px;
      --tile-h: 28px;
    }

    .face {
      position: absolute;
      inset: 6%;
      width: 88%;
      height: 88%;
      overflow: visible;
    }

    /* Set only where the art is a complete tile — the vendored back, and nothing else. It takes
       the whole element and the CSS slab gets out of the way, since otherwise the drawn edge sits
       inside a second, painted one. A *face* is the design alone and keeps its slab. */
    :host(.whole-tile) {
      background: none;
      border-color: transparent;
      /* The art draws the slab but not the table under it. Keep the thickness and the cast
         shadow — otherwise a face-down tile is a flat sticker next to face-up ones — and drop only
         the inset highlight, which would sit on top of a lit edge the art has already drawn. */
      box-shadow:
        0 calc(var(--tile-w) * 0.06) 0 var(--mj-tile-side),
        0 calc(var(--tile-w) * 0.09) calc(var(--tile-w) * 0.1) rgb(0 0 0 / 35%);
    }

    :host(.whole-tile) .face {
      inset: 0;
      width: 100%;
      height: 100%;
    }

    /* …including for a face-down tile, whose back is part of the same sheet. */
    :host(.whole-tile.back) {
      background: none;
      border-color: transparent;
    }

    :host(.whole-tile.back)::after {
      content: none;
    }

    /* Face-down: no face, a distinct body, and a visible weave so it is not "a tile that failed". */
    :host(.back) {
      background: linear-gradient(165deg, var(--mj-tile-back-hi), var(--mj-tile-back));
      border-color: var(--mj-tile-back-edge);
    }

    :host(.back)::after {
      content: '';
      position: absolute;
      inset: 14%;
      border-radius: calc(var(--tile-w) * 0.06);
      border: 1px solid var(--mj-tile-back-edge);
      opacity: 0.7;
    }

    /* Suit tinting is opt-in (docs/08 §3) and never the only cue — the face already differs. */
    :host(.suit-colour[data-suit='m']) {
      color: var(--mj-ink-man);
    }
    :host(.suit-colour[data-suit='p']) {
      color: var(--mj-ink-pin);
    }
    :host(.suit-colour[data-suit='s']) {
      color: var(--mj-ink-sou);
    }

    :host(.interactive) {
      cursor: pointer;
      transition: transform 90ms ease-out;
    }

    :host(.interactive:hover),
    :host(.interactive:focus-visible) {
      transform: translateY(calc(var(--tile-h) * -0.09));
    }

    :host(.selected) {
      transform: translateY(calc(var(--tile-h) * -0.18));
      box-shadow:
        0 0 0 2px var(--mj-accent),
        0 calc(var(--tile-w) * 0.12) calc(var(--tile-w) * 0.14) rgb(0 0 0 / 45%);
    }

    :host(.disabled) {
      opacity: 0.42;
      cursor: not-allowed;
    }

    :host(.dimmed) {
      opacity: 0.55;
    }

    /* Dora: a corner wedge as well as the tint, because colour is never the only carrier. */
    .marker {
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 0;
      width: 34%;
      height: 34%;
      background: var(--mj-accent);
      clip-path: polygon(100% 0, 0 0, 100% 100%);
      border-start-end-radius: calc(var(--tile-w) * 0.11);
    }

    :host(.rotated) {
      transform: rotate(90deg);
    }

    @media (prefers-reduced-motion: reduce) {
      :host(.interactive) {
        transition: none;
      }
      :host(.interactive:hover),
      :host(.interactive:focus-visible) {
        transform: none;
      }
    }
  `,
})
export class TileComponent {
  private readonly settings = inject(SettingsService);
  private readonly sprite = inject(TileSpriteService);

  /** `null` renders the back — an opponent's hand, or the dead wall. */
  readonly tile = input<TileStr | null>(null);
  readonly size = input<TileSize>('hand');
  readonly rotated = input(false);
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly dimmed = input(false);
  readonly interactive = input(false);
  /** The dora wedge. Set by the hand, which is the only place that knows the indicators. */
  readonly marker = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly testId = input<string | null>(null);

  /**
   * The set actually in use.
   *
   * The chosen set unless its sheet could not be fetched, in which case the inline set — which is
   * always in the document — rather than 136 blank slabs.
   */
  protected readonly activeSet = computed<TileSet>(() => {
    const chosen = this.settings.tileSet();
    return this.sprite.failed().includes(chosen) ? FALLBACK_TILE_SET : chosen;
  });

  protected readonly info = computed(() => TILE_SET_INFO[this.activeSet()]);

  /**
   * Whether *this* symbol draws its own slab, in which case the CSS body steps aside.
   *
   * A property of the symbol, not of the set: the vendored back is a finished tile and the
   * vendored faces are designs on a transparent ground, so asking the set gets one of them wrong.
   */
  protected readonly wholeTile = computed(() => {
    const { face, back } = this.info().drawsBody;
    return this.tile() === null ? back : face;
  });

  /** A face-down tile: the set's own back if it has one, otherwise the CSS back. */
  protected readonly backId = computed(() => backSymbolId(this.activeSet()));

  protected readonly viewBox = computed(() => this.info().viewBox);

  protected readonly symbolId = computed(() => {
    const tile = this.tile();
    if (tile === null) return this.backId() ?? '';
    return faceSymbolId(tile, this.activeSet());
  });

  /** Whether there is anything to draw with `<use>` at all. */
  protected readonly hasSymbol = computed(() => this.symbolId().length > 0);

  protected readonly suit = computed(() => this.tile()?.[1] ?? 'z');
  protected readonly isRed = computed(() => {
    const tile = this.tile();
    return tile !== null && isRedTileStr(tile);
  });
  protected readonly suitColour = computed(() => this.settings.suitColour());

  protected readonly label = computed(() => {
    const override = this.ariaLabel();
    if (override !== null) return override;
    const tile = this.tile();
    return tile === null ? FACE_DOWN_LABEL : tileName(tile, this.settings.tileNaming());
  });
}
