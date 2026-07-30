import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Seat } from '@contracts/actions';
import type { SeatConfig, SeatFill } from '@contracts/views';

import { AuthService } from '@core/auth/auth.service';

import { TableStore } from '@features/table/table.store';
import type { CreateTableRequest } from '@features/table/table.store';

import { LobbyComponent } from './lobby.component';
import { LobbyStore } from './lobby.store';

interface LobbyInternals {
  createLength: 'hanchan' | 'tonpuusen';
  isPrivate: boolean;
  inviteCode: string;
  create(): Promise<void>;
  setFill(seat: Seat, fill: SeatFill): void;
  seatConfigs(): [SeatConfig, SeatConfig, SeatConfig, SeatConfig];
}

describe('LobbyComponent', () => {
  let fixture: ComponentFixture<LobbyComponent>;
  let component: LobbyInternals;
  let created: CreateTableRequest[];

  beforeEach(() => {
    created = [];

    TestBed.configureTestingModule({
      imports: [LobbyComponent],
      providers: [
        {
          provide: LobbyStore,
          useValue: {
            isQueued: signal(false),
            queueStatus: signal(null),
            matchedTableId: signal(null),
            cancelled: signal(null),
            error: signal(null),
            consumeMatch: vi.fn(),
            quickmatch: vi.fn().mockResolvedValue(true),
            cancel: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TableStore,
          useValue: {
            error: signal(null),
            create: vi.fn(async (request: CreateTableRequest) => {
              created.push(request);
              return 'table-1';
            }),
            join: vi.fn().mockResolvedValue('table-1'),
          },
        },
        {
          provide: AuthService,
          useValue: { displayName: signal('Guest-1001'), isGuest: signal(true) },
        },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      ],
    });

    fixture = TestBed.createComponent(LobbyComponent);
    component = fixture.componentInstance as unknown as LobbyInternals;
    fixture.detectChanges();
  });

  /**
   * The regression this file exists for.
   *
   * The server seats the creator in the first seat whose fill is `open`
   * (`docs/05-realtime-protocol.md` §3). Sending three bots and a `locked` chair produced a table
   * with nowhere for the person who made it: no seat, so no Ready button, and "Start now" filled
   * the last chair with a fourth bot. Four bots then played a game its creator could only watch.
   */
  it('always leaves a seat open for the creator', async () => {
    await component.create();

    expect(created).toHaveLength(1);
    expect(created[0]?.seats.some((seat) => seat.fill === 'open')).toBe(true);
  });

  it('keeps the creator a seat even if every other seat is closed', async () => {
    for (const seat of [1, 2, 3] as Seat[]) component.setFill(seat, 'locked');
    fixture.detectChanges();

    await component.create();
    // Their own chair is not a preference, so it survives whatever the rest was set to.
    expect(created[0]?.seats[0]).toEqual({ fill: 'open' });
    expect(created[0]?.seats.slice(1).every((seat) => seat.fill === 'locked')).toBe(true);
  });

  it('defaults to a private-style table of one human and three bots', () => {
    const seats = component.seatConfigs();
    expect(seats[0].fill).toBe('open');
    expect(seats.slice(1).map((seat) => seat.fill)).toEqual(['bot', 'bot', 'bot']);
    expect(seats.slice(1).every((seat) => seat.botLevel === 'normal')).toBe(true);
  });

  it('passes the bot difficulty the host chose', async () => {
    component.setFill(1, 'bot');
    fixture.detectChanges();
    await component.create();

    expect(created[0]?.seats[1]).toEqual({ fill: 'bot', botLevel: 'normal' });
  });

  it('sends the length and privacy the form is showing', async () => {
    component.createLength = 'tonpuusen';
    component.isPrivate = true;
    await component.create();

    expect(created[0]?.length).toBe('tonpuusen');
    expect(created[0]?.private).toBe(true);
  });
});
