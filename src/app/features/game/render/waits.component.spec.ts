import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { WaitView } from '@contracts/views';

import { WaitsComponent } from './waits.component';

/**
 * The one thing this component must never do is tell a player they can ron when they cannot.
 *
 * Furiten blocks ron on *every* wait, not only on the tiles in the pond, so greying the discarded
 * ones is a hint about the cause and never the whole message. These tests pin both halves.
 */
describe('WaitsComponent', () => {
  let fixture: ComponentFixture<WaitsComponent>;

  function render(waits: WaitView): void {
    fixture = TestBed.createComponent(WaitsComponent);
    fixture.componentRef.setInput('waits', waits);
    fixture.detectChanges();
  }

  function tile(name: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="waits-${name}"]`);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [WaitsComponent] });
  });

  it('renders one tile per wait', () => {
    render({ tiles: ['3s', '6s'], inMyDiscards: [], furiten: false });
    expect(tile('3s')).not.toBeNull();
    expect(tile('6s')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Waiting on');
  });

  it('greys only the waits sitting in the player’s own pond', () => {
    render({ tiles: ['3s', '6s'], inMyDiscards: ['3s'], furiten: true });
    expect(tile('3s')?.classList.contains('dimmed')).toBe(true);
    expect(tile('6s')?.classList.contains('dimmed')).toBe(false);
  });

  it('says furiten in words, not only by greying a tile', () => {
    // The failure this guards: a player reads one grey tile among three, assumes the other two are
    // live, and calls a ron the server refuses.
    render({ tiles: ['3s', '6s'], inMyDiscards: ['3s'], furiten: true });
    expect(fixture.nativeElement.textContent).toContain('Furiten');
    expect(fixture.nativeElement.textContent).not.toContain('Waiting on');
    expect((fixture.nativeElement as HTMLElement).classList.contains('furiten')).toBe(true);
  });

  it('marks furiten even when nothing is greyed', () => {
    // Temporary furiten — passing on a ron — and riichi furiten both block with an innocent pond.
    // Inferring the state from `inMyDiscards` alone would show this hand as winnable.
    render({ tiles: ['1p'], inMyDiscards: [], furiten: true });
    expect((fixture.nativeElement as HTMLElement).classList.contains('furiten')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Furiten');
    expect(tile('1p')?.classList.contains('dimmed')).toBe(false);
  });

  it('names the greyed tiles for a screen reader rather than relying on the grey', () => {
    render({ tiles: ['3s', '6s'], inMyDiscards: ['3s'], furiten: true });
    expect(tile('3s')?.getAttribute('aria-label')).toContain('in your discards');
    expect(tile('6s')?.getAttribute('aria-label')).not.toContain('in your discards');
  });
});
