import { Injectable, effect, inject, signal } from '@angular/core';

import { SettingsService } from '@core/settings/settings.service';

/**
 * Every sound the game makes.
 *
 * Spec: `docs/08-graphics-ux.md` §7 — *"Tile discard click, call announcement, riichi stick drop,
 * win chime, timer warning tick (last 3 s) … All audio is preloaded and played via a single
 * `AudioContext`; no per-event fetch."*
 *
 * **The effects are synthesised, not sampled.** Open decision 7 (tile art) was settled by
 * vendoring a CC0 set, and open decision 8 asks the same question of the voice clips — *"record vs
 * license"* — with the default *"Ship silent; voice is optional"*. That default is about the
 * *voice* channel, and it would be a poor reading of it to ship a silent game: the five effects
 * above are a click, a clack, a chime and a tick, and generating them from oscillators and noise is
 * both smaller than any sample pack and free of the licence question entirely. `M4` took the same
 * route with tile art before the licensed set arrived, for the same reason.
 *
 * That leaves {@link SFX} as a table of *descriptions* rather than of URLs. Each is rendered once
 * into an `AudioBuffer` at unlock time, so playback is a `BufferSource` and a gain node — the "no
 * per-event fetch" the doc asks for, arrived at from the other direction.
 *
 * **The voice channel is real and empty.** {@link registerVoice} takes decoded clips for the ~12
 * calls; nothing ships them, so `voice()` is a no-op and the volume control is honest about having
 * nothing to control. When a licensed or recorded set lands it is a call to `registerVoice` and no
 * other change.
 */

export type SfxName = 'discard' | 'draw' | 'call' | 'riichi' | 'win' | 'tick';

/** The Japanese calls of `docs/08` §7, as ids a clip pack would be keyed by. */
export type VoiceName = 'riichi' | 'pon' | 'chi' | 'kan' | 'ron' | 'tsumo';

interface Tone {
  /** Hz at the start, and at the end if it glides. */
  from: number;
  to?: number;
  /** Seconds. */
  duration: number;
  type: OscillatorType;
  /** Peak gain before the envelope, 0…1. */
  gain: number;
  /** A burst of filtered noise mixed in — what makes a tile sound like bakelite and not a beep. */
  noise?: number;
  /** Seconds after the start of the sound. */
  at?: number;
}

/**
 * The five effects, as tone stacks.
 *
 * Kept deliberately short: `docs/08` §8 budgets ~0 frame time on an idle table, and a sound that
 * outlasts the animation that triggered it is a sound that overlaps the next one.
 */
const SFX: Record<SfxName, Tone[]> = {
  // A tile meeting the table: a short mid click with a noise transient.
  discard: [{ from: 420, to: 190, duration: 0.07, type: 'triangle', gain: 0.5, noise: 0.6 }],
  // Lifting one off the wall — quieter, higher, no impact.
  draw: [{ from: 700, to: 520, duration: 0.045, type: 'sine', gain: 0.22, noise: 0.25 }],
  // A call is two tiles at once and should read as heavier than a discard.
  call: [
    { from: 300, to: 150, duration: 0.09, type: 'triangle', gain: 0.55, noise: 0.7 },
    { from: 240, to: 120, duration: 0.09, type: 'triangle', gain: 0.4, noise: 0.5, at: 0.05 },
  ],
  // The riichi stick: a light wooden tap, then its bounce.
  riichi: [
    { from: 900, to: 600, duration: 0.05, type: 'square', gain: 0.28, noise: 0.4 },
    { from: 1200, to: 800, duration: 0.04, type: 'sine', gain: 0.18, at: 0.07 },
  ],
  // A rising fifth: the one sound that is allowed to be musical.
  win: [
    { from: 523.25, duration: 0.16, type: 'sine', gain: 0.32 },
    { from: 783.99, duration: 0.28, type: 'sine', gain: 0.32, at: 0.12 },
  ],
  // The last-three-seconds tick. Dry and unpleasant on purpose.
  tick: [{ from: 1600, duration: 0.035, type: 'square', gain: 0.16 }],
};

/** Attack, in seconds. Long enough not to click, short enough to stay percussive. */
const ATTACK = 0.004;

@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly settings = inject(SettingsService);

  private context: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private readonly buffers = new Map<SfxName, AudioBuffer>();
  private readonly voices = new Map<VoiceName, AudioBuffer>();

  private readonly _ready = signal(false);
  readonly ready = this._ready.asReadonly();

  constructor() {
    // The volumes are signals, so the sliders move the gain nodes without anything subscribing.
    effect(() => {
      const { sfx, voice } = this.settings.sound();
      const now = this.context?.currentTime ?? 0;
      this.sfxGain?.gain.setTargetAtTime(clamp(sfx), now, 0.01);
      this.voiceGain?.gain.setTargetAtTime(clamp(voice), now, 0.01);
    });
  }

  /**
   * Create the context and render the effects.
   *
   * Must be called from a user gesture: every browser starts an `AudioContext` suspended until one
   * has happened, and a context created at boot is a context that stays silent for the whole
   * session. The game screen calls this on the first click or key press.
   *
   * Idempotent, and never throws — a browser with no Web Audio is a browser that plays no sounds,
   * not one that fails to start.
   */
  unlock(): void {
    if (this.context !== null) {
      void this.context.resume().catch(() => undefined);
      return;
    }
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;

    try {
      const context = new Ctor();
      const sfxGain = context.createGain();
      const voiceGain = context.createGain();
      const { sfx, voice } = this.settings.sound();
      sfxGain.gain.value = clamp(sfx);
      voiceGain.gain.value = clamp(voice);
      sfxGain.connect(context.destination);
      voiceGain.connect(context.destination);

      this.context = context;
      this.sfxGain = sfxGain;
      this.voiceGain = voiceGain;
      for (const name of Object.keys(SFX) as SfxName[]) {
        this.buffers.set(name, render(context, SFX[name]));
      }
      this._ready.set(true);
      void context.resume().catch(() => undefined);
    } catch {
      this.context = null;
    }
  }

  /** One effect. Silent — not queued — before {@link unlock} or at zero volume. */
  play(name: SfxName): void {
    const context = this.context;
    const gain = this.sfxGain;
    const buffer = this.buffers.get(name);
    if (context === null || gain === null || buffer === undefined) return;
    if (this.settings.sound().sfx <= 0) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
  }

  /**
   * One voice call, if a pack has been registered.
   *
   * Open decision 8 is undecided, so nothing registers one and this does nothing. The call sites
   * are still written against it: a game that has to grow new calls to `voice()` when clips arrive
   * is a game where half of them get forgotten.
   */
  voice(name: VoiceName): void {
    const context = this.context;
    const gain = this.voiceGain;
    const buffer = this.voices.get(name);
    if (context === null || gain === null || buffer === undefined) return;
    if (this.settings.sound().voice <= 0) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
  }

  /** Install a decoded voice pack. See {@link voice}. */
  registerVoice(clips: Partial<Record<VoiceName, AudioBuffer>>): void {
    for (const [name, buffer] of Object.entries(clips)) {
      if (buffer !== undefined) this.voices.set(name as VoiceName, buffer);
    }
  }

  /** Whether a voice pack exists — what the settings screen greys the voice slider on. */
  hasVoice(): boolean {
    return this.voices.size > 0;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Render a tone stack into a buffer, once.
 *
 * Additive: each tone is a sine/square/triangle at a (possibly gliding) frequency, shaped by an
 * exponential decay, plus optional white noise through the same envelope. Everything is computed
 * per sample rather than through the node graph because the result has to be a *buffer* — the point
 * is that playback allocates nothing but a `BufferSource`.
 */
function render(context: AudioContext, tones: readonly Tone[]): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.max(
    1,
    Math.ceil(rate * Math.max(...tones.map((tone) => (tone.at ?? 0) + tone.duration))),
  );
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);

  for (const tone of tones) {
    const start = Math.floor((tone.at ?? 0) * rate);
    const samples = Math.floor(tone.duration * rate);
    let phase = 0;
    for (let index = 0; index < samples; index++) {
      const t = index / samples;
      const frequency = tone.to === undefined ? tone.from : tone.from + (tone.to - tone.from) * t;
      phase += (2 * Math.PI * frequency) / rate;

      // Linear attack into an exponential decay: the shape of anything struck.
      const seconds = index / rate;
      const envelope =
        seconds < ATTACK ? seconds / ATTACK : Math.exp(-4 * ((seconds - ATTACK) / tone.duration));

      const noise = tone.noise === undefined ? 0 : (Math.random() * 2 - 1) * tone.noise;
      const value = wave(tone.type, phase) * (1 - (tone.noise ?? 0) * 0.5) + noise;
      const at = start + index;
      if (at < length) data[at] = (data[at] ?? 0) + value * envelope * tone.gain;
    }
  }

  // Normalise so a two-tone stack is not twice as loud as a one-tone one.
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  if (peak > 1) {
    for (let index = 0; index < data.length; index++) data[index] = (data[index] ?? 0) / peak;
  }
  return buffer;
}

function wave(type: OscillatorType, phase: number): number {
  switch (type) {
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1;
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(phase));
    case 'sawtooth':
      return 2 * ((phase / (2 * Math.PI)) % 1) - 1;
    default:
      return Math.sin(phase);
  }
}
