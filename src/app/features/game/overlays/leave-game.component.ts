import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';

/**
 * Leaving a game in progress.
 *
 * There is a way out of every other screen and there was none out of this one, which leaves a
 * player who has to stop with no move except closing the tab — and closing the tab is the
 * *undiagnosable* version of the same thing, since the table then waits out the disconnect grace
 * wondering whether they are coming back.
 *
 * It confirms first, because leaving is not undoable in the way the rest of the interface is:
 * mid-hand the seat goes to a bot and the game carries on without its player
 * (`docs/04-game-engine.md` §4, and `Table.leaveSeat` — *"after it starts, leaving is a disconnect,
 * not a exit"*). The confirmation says exactly that rather than "are you sure?", which asks a
 * question the player cannot answer without knowing what happens to their seat.
 */
@Component({
  selector: 'mj-leave-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="trigger"
      data-testid="leave-game"
      aria-haspopup="dialog"
      (click)="open.emit()"
    >
      Leave
    </button>

    @if (confirming()) {
      <div class="scrim" aria-hidden="true"></div>
      <div
        class="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mj-leave-title"
        data-testid="leave-confirm"
      >
        <h2 id="mj-leave-title">Leave this game?</h2>
        <p>
          @if (seated()) {
            A bot will play your seat and the game will finish without you. Your score still counts.
          } @else {
            You are watching this table, so nothing at it changes.
          }
        </p>
        <div class="row">
          <button
            #confirmButton
            type="button"
            class="primary"
            data-testid="leave-confirm-yes"
            (click)="confirm.emit()"
          >
            Leave
          </button>
          <button type="button" data-testid="leave-confirm-no" (click)="dismiss.emit()">
            Keep playing
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .trigger {
      position: absolute;
      inset-block-start: 10px;
      inset-inline-start: 10px;
      z-index: 3;
      padding: 5px 14px;
      border-radius: 999px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .trigger:hover,
    .trigger:focus-visible {
      border-color: var(--mj-accent);
    }

    .scrim {
      position: absolute;
      inset: 0;
      z-index: 9;
      background: rgb(0 0 0 / 45%);
    }

    .modal {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 50%;
      translate: -50% -50%;
      z-index: 10;
      inline-size: min(420px, 88%);
      padding: 20px 22px;
      border-radius: 12px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      box-shadow: 0 18px 40px rgb(0 0 0 / 45%);
      text-align: center;
    }

    .modal h2 {
      margin: 0 0 8px;
      font-size: 19px;
    }

    .modal p {
      margin: 0 0 16px;
      color: var(--mj-text-muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .row {
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .row button {
      padding: 8px 18px;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: transparent;
      color: var(--mj-text);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .row .primary {
      background: var(--mj-danger);
      border-color: var(--mj-danger);
      color: #2b0d0d;
    }
  `,
})
export class LeaveGameComponent {
  /** Whether the player holds a seat: a spectator leaving changes nothing at the table. */
  readonly seated = input(false);
  /** Owned by the game screen, which also has to stop the board's keys while it is open. */
  readonly confirming = input(false);

  readonly open = output<void>();
  readonly dismiss = output<void>();
  readonly confirm = output<void>();

  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  constructor() {
    // Move focus into the dialog when it opens. Without it focus stays on the trigger *behind* the
    // scrim, so the first Tab walks the board rather than the two answers — and a screen reader is
    // left reading a board the player can no longer act on.
    effect(() => {
      if (this.confirming()) this.confirmButton()?.nativeElement.focus();
    });
  }
}
