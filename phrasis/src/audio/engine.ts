/**
 * Minimal Web Audio playback: a soft mallet/e-piano voice and a look-ahead
 * scheduler that reports the playhead in ticks.
 */
import { TPQ } from '../model/types';

export interface PlayEvent {
  pitch: number;
  start: number;
  dur: number;
  vel: number;
  /** Quieter, darker voice for secondary material (lower voice, ghost notes). */
  soft?: boolean;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private events: PlayEvent[] = [];
  private tempo = 112;
  private startTime = 0;
  private startTick = 0;
  private scheduledUntil = 0;
  private loop: { from: number; to: number } | null = null;
  private endTick = 0;
  private volume = 0.8;
  private onEnd: (() => void) | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  playing = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(comp);
      comp.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.02);
  }

  /** Output level 0–1 for the meter. */
  level(): number {
    if (!this.analyser) return 0;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 64);
  }

  private secPerTick() {
    return 60 / this.tempo / TPQ;
  }

  voice(pitch: number, when: number, dur: number, vel: number, soft = false) {
    const ctx = this.ensure();
    const master = this.master!;
    const f = mtof(pitch);
    const amp = (vel / 127) * (soft ? 0.18 : 0.32);
    const out = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = soft ? 1400 : 2400 + vel * 18;
    filter.Q.value = 0.4;
    out.gain.setValueAtTime(0.0001, when);
    out.gain.exponentialRampToValueAtTime(amp, when + 0.006);
    out.gain.exponentialRampToValueAtTime(amp * 0.55, when + 0.18);
    const release = Math.max(when + 0.05, when + dur - 0.02);
    out.gain.setTargetAtTime(amp * 0.4, when + 0.18, Math.max(0.2, dur));
    out.gain.setTargetAtTime(0.0001, release, 0.08);
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o1.connect(filter);
    o2.connect(g2);
    g2.connect(filter);
    filter.connect(out);
    out.connect(master);
    const stopAt = release + 0.6;
    for (const o of [o1, o2]) {
      o.start(when);
      o.stop(stopAt);
      this.active.add(o);
      o.onended = () => this.active.delete(o);
    }
  }

  /** Audition a short list of events immediately (variation previews, note clicks). */
  audition(events: PlayEvent[], tempo: number) {
    const ctx = this.ensure();
    const spt = 60 / tempo / TPQ;
    const t0 = ctx.currentTime + 0.03;
    for (const e of events) this.voice(e.pitch, t0 + e.start * spt, Math.max(0.08, e.dur * spt), e.vel, e.soft);
  }

  start(events: PlayEvent[], opts: { tempo: number; from: number; end: number; loop?: { from: number; to: number } | null; onEnd?: () => void }) {
    const ctx = this.ensure();
    this.stop();
    this.events = [...events].sort((a, b) => a.start - b.start);
    this.tempo = opts.tempo;
    this.startTick = opts.from;
    this.startTime = ctx.currentTime + 0.05;
    this.scheduledUntil = opts.from;
    this.loop = opts.loop ?? null;
    this.endTick = opts.end;
    this.onEnd = opts.onEnd ?? null;
    this.playing = true;
    this.pump();
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  setTempo(tempo: number) {
    if (!this.playing || !this.ctx) {
      this.tempo = tempo;
      return;
    }
    const pos = this.position();
    this.tempo = tempo;
    this.startTick = pos;
    this.startTime = this.ctx.currentTime;
    this.scheduledUntil = pos;
  }

  private rawTick(): number {
    if (!this.ctx) return this.startTick;
    return this.startTick + (this.ctx.currentTime - this.startTime) / this.secPerTick();
  }

  /** Current playhead in ticks (wrapped when looping). */
  position(): number {
    const t = this.rawTick();
    if (this.loop && t >= this.loop.to) {
      const len = this.loop.to - this.loop.from;
      return this.loop.from + ((t - this.loop.from) % len);
    }
    return t;
  }

  private pump() {
    if (!this.ctx || !this.playing) return;
    const lookahead = 0.15 / this.secPerTick();
    const horizon = this.rawTick() + lookahead;
    const toAbs = (tick: number) => this.startTime + (tick - this.startTick) * this.secPerTick();
    while (this.scheduledUntil < horizon) {
      const segEnd = horizon;
      // Map the raw window onto musical time, handling loop wrap-around.
      let from = this.scheduledUntil;
      let to = segEnd;
      let offset = 0;
      if (this.loop) {
        const len = this.loop.to - this.loop.from;
        if (from >= this.loop.to) {
          const k = Math.floor((from - this.loop.from) / len);
          offset = k * len;
          from -= offset;
          to -= offset;
        }
        to = Math.min(to, this.loop.to);
      }
      for (const e of this.events) {
        if (e.start >= from && e.start < to) {
          this.voice(e.pitch, Math.max(this.ctx.currentTime, toAbs(e.start + offset)), e.dur * this.secPerTick(), e.vel, e.soft);
        }
      }
      this.scheduledUntil = to + offset;
      if (!this.loop) break;
    }
    if (!this.loop && this.rawTick() >= this.endTick) {
      const cb = this.onEnd;
      this.stop();
      cb?.();
    }
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.playing && this.ctx) {
      for (const o of this.active) {
        try {
          o.stop(this.ctx.currentTime + 0.05);
        } catch {
          /* already stopped */
        }
      }
      this.active.clear();
    }
    this.playing = false;
  }
}

export const engine = new Engine();
