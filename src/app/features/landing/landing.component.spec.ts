import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@contracts/protocol';
import type { ProtocolError, SessionHelloPayload } from '@contracts/protocol';

import { APP_CONFIG, buildAppConfig } from '@core/config/app-config';
import { SocketService } from '@core/socket/socket.service';
import type { ConnectionStatus } from '@core/socket/socket.types';

import { LandingComponent } from './landing.component';

const HELLO: SessionHelloPayload = {
  protocolVersion: PROTOCOL_VERSION,
  serverTime: 1_700_000_000_000,
  userId: null,
};

/** A stand-in for the socket service with the same signal surface. */
function stubSocket() {
  const status = signal<ConnectionStatus>('idle');
  const hello = signal<SessionHelloPayload | null>(null);
  const lastError = signal<ProtocolError | null>(null);
  return {
    status,
    hello,
    lastError,
    clockSkewMs: signal<number | null>(null),
    isConnected: signal(false),
    connect: vi.fn(),
    reconnect: vi.fn(),
  };
}

describe('LandingComponent', () => {
  let socket: ReturnType<typeof stubSocket>;
  let fixture: ComponentFixture<LandingComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(testId: string): string | null {
    const element = host().querySelector(`[data-testid="${testId}"]`);
    return element?.textContent?.trim() ?? null;
  }

  beforeEach(() => {
    socket = stubSocket();
    TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [
        { provide: SocketService, useValue: socket },
        {
          provide: APP_CONFIG,
          useValue: buildAppConfig({
            production: false,
            apiUrl: 'http://api.test',
            socketUrl: 'http://socket.test',
          }),
        },
      ],
    });
    fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
  });

  it('opens the connection as soon as it is shown', () => {
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('shows the endpoint and protocol version it will speak', () => {
    expect(text('server-url')).toBe('http://socket.test');
    expect(text('protocol')).toBe(`v${PROTOCOL_VERSION}`);
  });

  it('says "Connected" once the handshake lands', () => {
    socket.status.set('connected');
    socket.hello.set(HELLO);
    fixture.detectChanges();

    expect(text('connection-label')).toBe('Connected');
    expect(text('session')).toBe('guest (unauthenticated)');
  });

  it('names every connection state in words, not just colour', () => {
    const expected: Record<ConnectionStatus, string> = {
      idle: 'Not connected',
      connecting: 'Connecting…',
      connected: 'Connected',
      reconnecting: 'Reconnecting…',
      disconnected: 'Disconnected',
      'protocol-mismatch': 'Update required',
    };
    for (const [status, label] of Object.entries(expected)) {
      socket.status.set(status as ConnectionStatus);
      fixture.detectChanges();
      expect(text('connection-label')).toBe(label);
    }
  });

  it('surfaces protocol errors', () => {
    socket.status.set('protocol-mismatch');
    socket.lastError.set({ code: 'PROTOCOL_MISMATCH', message: 'server speaks v2' });
    fixture.detectChanges();

    expect(text('error')).toContain('PROTOCOL_MISMATCH');
    expect(text('error')).toContain('server speaks v2');
  });

  it('offers a retry only when retrying could help', () => {
    socket.status.set('connecting');
    fixture.detectChanges();
    expect(text('retry')).toBeNull();

    socket.status.set('disconnected');
    fixture.detectChanges();
    expect(text('retry')).toBe('Retry');

    host().querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    expect(socket.reconnect).toHaveBeenCalledTimes(1);
  });
});
