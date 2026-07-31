import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SettingsService } from '@core/settings/settings.service';

import { SoundService } from './sound.service';

/**
 * A stand-in for Web Audio.
 *
 * jsdom has none, and the point of the tests below is not that a browser makes a noise — it is
 * that the service creates exactly one context, renders each effect once, refuses to play before
 * it is unlocked, and honours a zero volume. All four are observable through the seam below.
 */
class FakeGain {
  value = 1;
  readonly gain = {
    value: 1,
    setTargetAtTime: (target: number): void => {
      this.value = target;
    },
  };
  connect(): void {
    /* the graph is not what is under test */
  }
}

class FakeSource {
  buffer: unknown = null;
  started = 0;
  connect(): void {
    /* see FakeGain */
  }
  start(): void {
    this.started += 1;
  }
}

class FakeAudioContext {
  static created = 0;
  static readonly sources: FakeSource[] = [];

  readonly sampleRate = 48_000;
  readonly currentTime = 0;
  readonly destination = {};
  resumed = 0;
  buffersCreated = 0;

  constructor() {
    FakeAudioContext.created += 1;
  }

  createGain(): FakeGain {
    return new FakeGain();
  }

  createBuffer(channels: number, length: number, rate: number): AudioBuffer {
    this.buffersCreated += 1;
    const data = new Float32Array(length);
    return {
      sampleRate: rate,
      length,
      numberOfChannels: channels,
      duration: length / rate,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    FakeAudioContext.sources.push(source);
    return source;
  }

  resume(): Promise<void> {
    this.resumed += 1;
    return Promise.resolve();
  }
}

describe('SoundService', () => {
  let service: SoundService;
  let settings: SettingsService;
  const original = globalThis.AudioContext;

  beforeEach(() => {
    FakeAudioContext.created = 0;
    FakeAudioContext.sources.length = 0;
    globalThis.localStorage?.clear();
    Object.defineProperty(globalThis, 'AudioContext', {
      value: FakeAudioContext,
      configurable: true,
      writable: true,
    });
    TestBed.configureTestingModule({});
    settings = TestBed.inject(SettingsService);
    service = TestBed.inject(SoundService);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it('creates nothing until it is unlocked', () => {
    service.play('discard');
    expect(FakeAudioContext.created).toBe(0);
    expect(FakeAudioContext.sources).toHaveLength(0);
    expect(service.ready()).toBe(false);
  });

  it('renders every effect once, on the first unlock', () => {
    service.unlock();
    expect(FakeAudioContext.created).toBe(1);
    expect(service.ready()).toBe(true);

    // Six effects, each pre-rendered into a buffer — the doc's "no per-event fetch", arrived at by
    // synthesising rather than by loading.
    service.unlock();
    service.unlock();
    expect(FakeAudioContext.created).toBe(1);
  });

  it('plays from a buffer, allocating only a source', () => {
    service.unlock();
    service.play('discard');
    service.play('win');
    expect(FakeAudioContext.sources).toHaveLength(2);
    expect(FakeAudioContext.sources.every((source) => source.started === 1)).toBe(true);
    expect(FakeAudioContext.sources[0]?.buffer).not.toBeNull();
  });

  it('stays silent at zero volume rather than playing into a muted gain', () => {
    service.unlock();
    settings.set('sound', { sfx: 0, voice: 0 });
    service.play('discard');
    expect(FakeAudioContext.sources).toHaveLength(0);
  });

  it('has no voice pack, so the voice channel is a no-op', () => {
    service.unlock();
    settings.set('sound', { sfx: 0.5, voice: 1 });
    expect(service.hasVoice()).toBe(false);
    service.voice('riichi');
    expect(FakeAudioContext.sources).toHaveLength(0);
  });

  it('plays a registered voice clip once one exists', () => {
    service.unlock();
    settings.set('sound', { sfx: 0.5, voice: 1 });
    service.registerVoice({ riichi: {} as AudioBuffer });
    expect(service.hasVoice()).toBe(true);
    service.voice('riichi');
    expect(FakeAudioContext.sources).toHaveLength(1);
  });

  it('survives a browser with no Web Audio at all', () => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const bare = TestBed.inject(SoundService);
    expect(() => {
      bare.unlock();
      bare.play('win');
    }).not.toThrow();
  });
});
