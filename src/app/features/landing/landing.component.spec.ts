import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '@contracts/auth';
import { PROTOCOL_VERSION } from '@contracts/protocol';
import type { ProtocolError, SessionHelloPayload } from '@contracts/protocol';

import { AuthError, AuthService } from '@core/auth/auth.service';
import { APP_CONFIG, buildAppConfig } from '@core/config/app-config';
import { SessionService } from '@core/session/session.service';
import { SocketService } from '@core/socket/socket.service';
import type { ConnectionStatus } from '@core/socket/socket.types';

import { LandingComponent } from './landing.component';

const HELLO: SessionHelloPayload = {
  protocolVersion: PROTOCOL_VERSION,
  serverTime: 1_700_000_000_000,
  userId: null,
};

const GUEST: AuthUser = {
  id: 'u1',
  displayName: 'Guest-4821',
  email: null,
  isGuest: true,
  avatarId: 'a1',
};

/** A stand-in for the socket service with the same signal surface. */
function stubSocket() {
  return {
    status: signal<ConnectionStatus>('idle'),
    hello: signal<SessionHelloPayload | null>(null),
    lastError: signal<ProtocolError | null>(null),
    clockSkewMs: signal<number | null>(null),
    isConnected: signal(false),
    demoted: signal(false),
    connect: vi.fn(),
    reconnect: vi.fn(),
  };
}

function stubAuth() {
  return {
    user: signal<AuthUser | null>(GUEST),
    displayName: signal<string | null>(GUEST.displayName),
    isGuest: signal(true),
    isAuthenticated: signal(true),
    ensureSession: vi.fn().mockResolvedValue(null),
    login: vi.fn().mockResolvedValue(null),
    register: vi.fn().mockResolvedValue(null),
    upgrade: vi.fn().mockResolvedValue(null),
  };
}

interface LandingInternals {
  email: string;
  password: string;
  displayName: string;
  submit(): Promise<void>;
}

describe('LandingComponent', () => {
  let socket: ReturnType<typeof stubSocket>;
  let auth: ReturnType<typeof stubAuth>;
  let session: { adoptNewToken: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<LandingComponent>;
  let component: LandingInternals;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(testId: string): string | null {
    const element = host().querySelector(`[data-testid="${testId}"]`);
    return element?.textContent?.trim() ?? null;
  }

  function click(testId: string): void {
    host().querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    socket = stubSocket();
    auth = stubAuth();
    session = { adoptNewToken: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined) };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [
        { provide: SocketService, useValue: socket },
        { provide: AuthService, useValue: auth },
        { provide: SessionService, useValue: session },
        { provide: Router, useValue: router },
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
    component = fixture.componentInstance as unknown as LandingInternals;
    fixture.detectChanges();
  });

  it('leaves connecting to the app initializer rather than doing it on render', () => {
    // M4 moved this: the socket is opened once at boot by `SessionService.bootstrap()`, so a
    // player who lands straight on `/game/:id` connects just as early as one who starts here.
    expect(socket.connect).not.toHaveBeenCalled();
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

    click('retry');
    expect(socket.reconnect).toHaveBeenCalledTimes(1);
  });

  it('goes to the lobby on "play as guest"', async () => {
    click('play-guest');
    await fixture.whenStable();

    expect(auth.ensureSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/lobby']);
  });

  it('upgrades the guest in place rather than registering a second account', async () => {
    click('show-register');
    component.email = 'a@b.test';
    component.password = 'correct horse battery staple';
    component.displayName = 'Kaori';

    await component.submit();

    expect(auth.upgrade).toHaveBeenCalledWith({
      email: 'a@b.test',
      password: 'correct horse battery staple',
      displayName: 'Kaori',
    });
    expect(auth.register).not.toHaveBeenCalled();
    // The socket is holding a token that still says `isGuest`; it has to re-handshake.
    expect(session.adoptNewToken).toHaveBeenCalled();
  });

  it('explains a rejected sign-in in words a player can act on', async () => {
    auth.login.mockRejectedValueOnce(new AuthError('INVALID_CREDENTIALS', 'nope'));
    click('show-login');

    await component.submit();
    fixture.detectChanges();

    expect(text('auth-error')).toBe('That email and password do not match an account.');
  });
});
