import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Action, ClientAction } from '@contracts/actions';
import type { Prompt } from '@contracts/views';

import { ActionBarComponent } from './action-bar.component';
import { ACTION_KINDS } from './action-slots';

function promptOf(options: Action[]): Prompt {
  return { promptId: 'p1', seat: 0, options, deadline: 0, bankRemaining: 20 };
}

describe('ActionBarComponent', () => {
  let fixture: ComponentFixture<ActionBarComponent>;

  function render(prompt: Prompt | null, riichiMode = false): void {
    fixture.componentRef.setInput('prompt', prompt);
    fixture.componentRef.setInput('riichiMode', riichiMode);
    fixture.detectChanges();
  }

  function testId(id: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  }

  function buttons(): string[] {
    return [...fixture.nativeElement.querySelectorAll('button.action:not(.empty)')].map(
      (button) => (button as HTMLElement).textContent?.trim() ?? '',
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActionBarComponent] });
    fixture = TestBed.createComponent(ActionBarComponent);
  });

  it('renders a button for every option and nothing else', () => {
    render(promptOf([{ type: 'pon', tiles: ['1m', '1m'] }, { type: 'pass' }]));
    expect(buttons()).toEqual(['Pon', 'Pass']);
    expect(testId('action-chi')).toBeNull();
    expect(testId('action-ron')).toBeNull();
  });

  it('renders nothing at all without a prompt', () => {
    render(null);
    expect(buttons()).toEqual([]);
  });

  it('keeps every slot in place so buttons never move between prompts', () => {
    render(promptOf([{ type: 'chi', tiles: ['3m', '4m'] }, { type: 'pass' }]));
    const withChi = [...fixture.nativeElement.querySelectorAll('.slots > *')].map((node) =>
      (node as HTMLElement).getAttribute('data-testid'),
    );

    render(promptOf([{ type: 'ron' }, { type: 'pon', tiles: ['1m', '1m'] }, { type: 'pass' }]));
    const withRon = [...fixture.nativeElement.querySelectorAll('.slots > *')].map((node) =>
      (node as HTMLElement).getAttribute('data-testid'),
    );

    // Eight cells, always, in the same order. A five-second call window cannot survive a reflow.
    expect(withChi).toHaveLength(ACTION_KINDS.length);
    expect(withRon).toHaveLength(ACTION_KINDS.length);
    const index = (ids: (string | null)[], kind: string): number => ids.indexOf(`action-${kind}`);
    expect(index(withRon, 'pon')).toBe(ACTION_KINDS.indexOf('pon'));
    expect(index(withRon, 'pass')).toBe(ACTION_KINDS.indexOf('pass'));
  });

  it('submits a call with only one form straight away', () => {
    const chosen: ClientAction[] = [];
    render(promptOf([{ type: 'pon', tiles: ['1m', '1m'] }]));
    fixture.componentInstance.choose.subscribe((action) => chosen.push(action));

    testId('action-pon')?.click();
    expect(chosen).toEqual([{ type: 'pon', tiles: ['1m', '1m'] }]);
  });

  it('asks which one when a call has more than one form', () => {
    const chosen: ClientAction[] = [];
    render(
      promptOf([
        { type: 'chi', tiles: ['3m', '4m'] },
        { type: 'chi', tiles: ['4m', '6m'] },
      ]),
    );
    fixture.componentInstance.choose.subscribe((action) => chosen.push(action));

    testId('action-chi')?.click();
    fixture.detectChanges();

    // Nothing is submitted on the first click: a client that picks for you loses your red five.
    expect(chosen).toEqual([]);
    expect(testId('variants')).not.toBeNull();

    testId('variant-1')?.click();
    expect(chosen).toEqual([{ type: 'chi', tiles: ['4m', '6m'] }]);
  });

  it('treats Riichi as a mode, not a submission', () => {
    const chosen: ClientAction[] = [];
    const modes: boolean[] = [];
    render(
      promptOf([
        { type: 'discard', tile: '1m' },
        { type: 'discard', tile: '9p', riichi: true },
      ]),
    );
    fixture.componentInstance.choose.subscribe((action) => chosen.push(action));
    fixture.componentInstance.toggleRiichiMode.subscribe((on) => modes.push(on));

    testId('action-riichi')?.click();
    expect(chosen).toEqual([]);
    expect(modes).toEqual([true]);
  });

  it('keeps the Riichi button visible while the mode is armed', () => {
    render(promptOf([{ type: 'discard', tile: '9p', riichi: true }]), true);
    const button = testId('action-riichi');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.classList.contains('armed')).toBe(true);
  });

  it('marks how many forms a call has', () => {
    render(
      promptOf([
        { type: 'ankan', kind: 4 },
        { type: 'shouminkan', tile: '3p' },
      ]),
    );
    expect(testId('action-kan')?.textContent?.trim()).toContain('2');
  });
});
