/**
 * Pack-opener sound effects (plan ui_draft_deckbuild_pack, D9).
 *
 * Everything is synthesized with the Web Audio API — no audio files ship with the
 * app. The AudioContext is created lazily on the first `play`/`rareSting` call,
 * which always happens inside a user gesture (the pack-open click), because
 * browsers block autoplay before one.
 *
 * Off by default: nothing is created or played unless `isSfxEnabled()` is true.
 */

const STORAGE_KEY = 'magicball.sfx';

/** Master gain (D9). Deliberately quiet — this plays over a UI, not a game. */
const MASTER_GAIN = 0.15;

export type SfxName = 'tear' | 'flip';
export type SfxRarity = 'Rare' | 'Mythic';

/** Off by default (D9) — only reads the persisted opt-in. */
export function isSfxEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSfxEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode / storage disabled — the toggle just doesn't persist */
  }
  if (!enabled) suspend();
}

type AudioContextCtor = new () => AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return (window.AudioContext as AudioContextCtor | undefined) ?? w.webkitAudioContext ?? null;
}

/**
 * Create (once) the context + master gain. Returns null when audio is off,
 * unsupported, or unavailable — every caller treats that as "stay silent".
 */
function ensureCtx(): { ctx: AudioContext; master: GainNode } | null {
  if (!isSfxEnabled()) return null;
  if (ctx && master) {
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, master };
  }
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    return { ctx, master };
  } catch {
    ctx = null;
    master = null;
    return null;
  }
}

function suspend(): void {
  if (ctx && ctx.state === 'running') void ctx.suspend();
}

/** White noise, generated once and reused by the noise-based voices. */
function getNoiseBuffer(context: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;
  const length = Math.floor(context.sampleRate * 0.5);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  endFreq?: number;
  start?: number;
  duration: number;
  peak?: number;
  attack?: number;
  detune?: number;
}

function tone(context: AudioContext, out: GainNode, o: ToneOptions): void {
  const t0 = context.currentTime + (o.start ?? 0);
  const osc = context.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.endFreq), t0 + o.duration);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

  const gain = context.createGain();
  const peak = o.peak ?? 0.5;
  const attack = o.attack ?? 0.008;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);

  osc.connect(gain);
  gain.connect(out);
  osc.start(t0);
  osc.stop(t0 + o.duration + 0.02);
}

interface NoiseOptions {
  start?: number;
  duration: number;
  peak?: number;
  filterType?: BiquadFilterType;
  freq: number;
  endFreq?: number;
  q?: number;
}

function noise(context: AudioContext, out: GainNode, o: NoiseOptions): void {
  const t0 = context.currentTime + (o.start ?? 0);
  const src = context.createBufferSource();
  src.buffer = getNoiseBuffer(context);
  src.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = o.filterType ?? 'bandpass';
  filter.frequency.setValueAtTime(o.freq, t0);
  if (o.endFreq !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.endFreq), t0 + o.duration);
  filter.Q.value = o.q ?? 1;

  const gain = context.createGain();
  const peak = o.peak ?? 0.4;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(t0);
  src.stop(t0 + o.duration + 0.02);
}

/**
 * `tear` — foil wrapper ripping: a bright noise sweep with a low thump under it.
 * `flip` — a card landing: short filtered noise tick plus a soft pitched blip.
 */
export function play(name: SfxName): void {
  const audio = ensureCtx();
  if (!audio) return;
  const { ctx: context, master: out } = audio;
  try {
    if (name === 'tear') {
      noise(context, out, { duration: 0.26, freq: 2600, endFreq: 900, q: 0.8, peak: 0.5, filterType: 'bandpass' });
      noise(context, out, { start: 0.05, duration: 0.2, freq: 4200, endFreq: 1800, q: 1.4, peak: 0.3 });
      tone(context, out, { type: 'triangle', freq: 160, endFreq: 70, duration: 0.3, peak: 0.35 });
    } else {
      noise(context, out, { duration: 0.07, freq: 3200, endFreq: 1500, q: 0.9, peak: 0.28, filterType: 'bandpass' });
      tone(context, out, { type: 'triangle', freq: 540, endFreq: 300, duration: 0.09, peak: 0.18 });
    }
  } catch {
    /* a voice failing must never break the reveal */
  }
}

/**
 * `rareSting` — the hold-start flourish. Rare is a two-note lift; Mythic is a
 * longer, detuned four-note arpeggio with a shimmer tail.
 */
export function rareSting(rarity: SfxRarity): void {
  const audio = ensureCtx();
  if (!audio) return;
  const { ctx: context, master: out } = audio;
  try {
    if (rarity === 'Rare') {
      tone(context, out, { type: 'sine', freq: 660, duration: 0.28, peak: 0.4 });
      tone(context, out, { type: 'sine', freq: 988, start: 0.1, duration: 0.36, peak: 0.34 });
      tone(context, out, { type: 'triangle', freq: 330, duration: 0.4, peak: 0.14 });
    } else {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        tone(context, out, { type: 'sine', freq, start: i * 0.09, duration: 0.5 - i * 0.05, peak: 0.34 });
        tone(context, out, { type: 'sine', freq, start: i * 0.09, duration: 0.5 - i * 0.05, peak: 0.16, detune: 9 });
      });
      tone(context, out, { type: 'triangle', freq: 261.63, duration: 0.75, peak: 0.16 });
      noise(context, out, { start: 0.3, duration: 0.45, freq: 5200, endFreq: 8000, q: 0.6, peak: 0.12, filterType: 'highpass' });
    }
  } catch {
    /* as above */
  }
}
