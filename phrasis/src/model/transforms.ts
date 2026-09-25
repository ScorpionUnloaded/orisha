/**
 * Non-destructive melodic transformations. Every function returns new notes
 * (with fresh ids) and never mutates its input.
 */
import { fromDegree, toDegree } from './theory';
import { uid } from './syntax';
import { T16, T8, TPQ } from './types';
import type { Note, ScaleRef, StepPattern, StepValue, Lane, Meter } from './types';

const byStart = (a: Note, b: Note) => a.start - b.start || a.pitch - b.pitch;
const clone = (n: Note, patch: Partial<Note> = {}): Note => ({ ...n, id: uid('n'), ...patch });
const clampPitch = (p: number) => Math.max(21, Math.min(108, p));

export function sorted(notes: Note[]): Note[] {
  return [...notes].sort(byStart);
}

export function transposeChromatic(notes: Note[], semis: number): Note[] {
  return notes.map((n) => clone(n, { pitch: clampPitch(n.pitch + semis) }));
}

/** Move every note by a number of scale degrees, keeping chromatic inflections. */
export function transposeDiatonic(notes: Note[], steps: number, scale: ScaleRef): Note[] {
  return notes.map((n) => {
    const deg = toDegree(n.pitch, scale);
    return clone(n, { pitch: clampPitch(fromDegree({ d: deg.d + steps, c: deg.c }, scale)) });
  });
}

/** Diatonic mirror around the first note (or a given axis pitch). */
export function invert(notes: Note[], scale: ScaleRef, axisPitch?: number): Note[] {
  const s = sorted(notes);
  if (!s.length) return [];
  const axis = toDegree(axisPitch ?? s[0].pitch, scale);
  return s.map((n) => {
    const deg = toDegree(n.pitch, scale);
    return clone(n, { pitch: clampPitch(fromDegree({ d: 2 * axis.d - deg.d, c: -deg.c }, scale)) });
  });
}

/** Reverse the order of events inside a span, keeping each duration. */
export function retrograde(notes: Note[], length: number): Note[] {
  return sorted(notes)
    .map((n) =>
      clone(n, {
        start: Math.max(0, length - (n.start + n.dur)),
        slur: n.slur === 'start' ? 'end' : n.slur === 'end' ? 'start' : undefined,
      }),
    )
    .sort(byStart);
}

export function retrogradeInversion(notes: Note[], length: number, scale: ScaleRef): Note[] {
  return retrograde(invert(notes, scale), length);
}

/** Augmentation (factor > 1) or diminution (factor < 1). */
export function scaleTime(notes: Note[], factor: number): Note[] {
  return notes.map((n) =>
    clone(n, { start: Math.round(n.start * factor), dur: Math.max(T16 / 2, Math.round(n.dur * factor)) }),
  );
}

/** Stretch (factor > 1) or compress (factor < 1) the intervals around the first note. */
export function scalePitch(notes: Note[], factor: number, scale: ScaleRef): Note[] {
  const s = sorted(notes);
  if (!s.length) return [];
  const ref = toDegree(s[0].pitch, scale);
  return s.map((n) => {
    const deg = toDegree(n.pitch, scale);
    return clone(n, {
      pitch: clampPitch(fromDegree({ d: ref.d + Math.round((deg.d - ref.d) * factor), c: deg.c }, scale)),
    });
  });
}

/**
 * Melodic sequence: the first half of the span is restated in the second
 * half, shifted by `steps` scale degrees.
 */
export function sequence(notes: Note[], steps: number, length: number, scale: ScaleRef): Note[] {
  const half = length / 2;
  const head = sorted(notes).filter((n) => n.start < half);
  const firstHalf = head.map((n) => clone(n, { dur: Math.min(n.dur, half - n.start) }));
  const restated = transposeDiatonic(firstHalf, steps, scale).map((n) => ({ ...n, start: n.start + half }));
  return [...firstHalf, ...restated];
}

/** Keep pitches, give pairs of equal notes a long–short (dotted) profile. */
export function rhythmicVariation(notes: Note[]): Note[] {
  const s = sorted(notes).map((n) => clone(n));
  for (let i = 0; i + 1 < s.length; i += 2) {
    const a = s[i];
    const b = s[i + 1];
    if (a.dur === b.dur && b.start === a.start + a.dur && a.dur >= T8) {
      const long = Math.round(a.dur * 1.5);
      s[i] = { ...a, dur: long };
      s[i + 1] = { ...b, start: a.start + long, dur: a.dur * 2 - long };
    } else if (a.dur >= TPQ && b.start === a.start + a.dur) {
      // Split a long note into a dotted figure leading to the next note.
      s[i] = { ...a, dur: (a.dur * 3) / 4 };
    }
  }
  return s;
}

/** Contour only: keep the direction of every step, reduce every interval to a step. */
export function contourOnly(notes: Note[], scale: ScaleRef): Note[] {
  const s = sorted(notes);
  if (!s.length) return [];
  let d = toDegree(s[0].pitch, scale).d;
  return s.map((n, i) => {
    if (i > 0) {
      const dir = Math.sign(n.pitch - s[i - 1].pitch);
      d += dir;
    }
    return clone(n, { pitch: fromDegree({ d, c: 0 }, scale) });
  });
}

export type ContourShape = 'arch' | 'valley' | 'ascending' | 'descending' | 'wave' | 'flat';

export function shapeCurve(shape: ContourShape, t: number): number {
  switch (shape) {
    case 'arch':
      return Math.sin(Math.PI * t);
    case 'valley':
      return 1 - Math.sin(Math.PI * t);
    case 'ascending':
      return t;
    case 'descending':
      return 1 - t;
    case 'wave':
      return 0.5 + 0.5 * Math.sin(3 * Math.PI * t);
    case 'flat':
      return 0.5;
  }
}

/** Reshape pitches so that the drawing follows a contour, within its current range. */
export function applyContour(notes: Note[], shape: ContourShape, length: number, scale: ScaleRef): Note[] {
  const s = sorted(notes);
  if (s.length < 2) return s.map((n) => clone(n));
  const degs = s.map((n) => toDegree(n.pitch, scale).d);
  const lo = Math.min(...degs);
  const hi = Math.max(lo + 4, Math.max(...degs));
  return s.map((n) => {
    const t = length > 0 ? (n.start + n.dur / 2) / length : 0;
    const target = lo + Math.round(shapeCurve(shape, Math.min(1, Math.max(0, t))) * (hi - lo));
    return clone(n, { pitch: fromDegree({ d: target, c: 0 }, scale) });
  });
}

/** Re-express pitches in another scale, degree for degree. */
export function remapScale(notes: Note[], from: ScaleRef, to: ScaleRef): Note[] {
  // Keep the register: shift the tonic to the nearest octave.
  let shift = to.tonic - from.tonic;
  if (shift > 6) shift -= 12;
  if (shift < -6) shift += 12;
  const target: ScaleRef = { tonic: from.tonic + shift, mode: to.mode };
  return notes.map((n) => {
    const deg = toDegree(n.pitch, from);
    return clone(n, { pitch: clampPitch(fromDegree(deg, target)) });
  });
}

/** Pull onsets toward a grid. */
export function quantize(notes: Note[], grid: number, strength: number): Note[] {
  return notes.map((n) => {
    const target = Math.round(n.start / grid) * grid;
    const start = Math.round(n.start + (target - n.start) * strength);
    const endTarget = Math.max(target + grid, Math.round((n.start + n.dur) / grid) * grid);
    const end = Math.round(n.start + n.dur + (endTarget - (n.start + n.dur)) * strength);
    return clone(n, { start, dur: Math.max(grid / 2, end - start) });
  });
}

/** Delay off-beat notes by `amount` (0–1) of the swing unit. */
export function swing(notes: Note[], amount: number, feel: 'eighth' | 'sixteenth'): Note[] {
  const unit = feel === 'eighth' ? T8 : T16;
  const shift = Math.round(unit * amount);
  const s = sorted(notes);
  const offbeat = (t: number) => t % (2 * unit) === unit;
  return s.map((n) => {
    if (offbeat(n.start)) return clone(n, { start: n.start + shift, dur: Math.max(T16 / 2, n.dur - shift) });
    if (offbeat(n.start + n.dur)) return clone(n, { dur: n.dur + shift });
    return clone(n);
  });
}

export interface RhythmEvent {
  start: number;
  dur: number;
  accent: boolean;
}

export function extractRhythm(notes: Note[]): RhythmEvent[] {
  return sorted(notes).map((n) => ({ start: n.start, dur: n.dur, accent: n.art === 'accent' }));
}

/**
 * Apply a rhythm to a pitch sequence.
 *  - replace-durations: onsets and durations come from the rhythm; pitches keep their order.
 *  - replace-onsets: onsets come from the rhythm; each note keeps its own duration (clipped).
 *  - accents-only: only accents are transferred.
 * `strength` blends timing between the original and the new rhythm.
 */
export function applyRhythm(
  notes: Note[],
  rhythm: RhythmEvent[],
  mode: 'replace-durations' | 'replace-onsets' | 'accents-only',
  strength = 1,
): Note[] {
  const s = sorted(notes);
  if (!s.length || !rhythm.length) return s.map((n) => clone(n));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * strength);
  if (mode === 'accents-only') {
    return s.map((n) => {
      const hit = rhythm.find((r) => Math.abs(r.start - n.start) < T16 / 2);
      const art = hit?.accent ? 'accent' : n.art === 'accent' ? undefined : n.art;
      return clone(n, { art });
    });
  }
  return rhythm.map((r, i) => {
    const src = s[i % s.length];
    const next = rhythm[i + 1];
    const dur = mode === 'replace-durations' ? r.dur : Math.min(src.dur, (next ? next.start : r.start + src.dur) - r.start);
    const origStart = i < s.length ? src.start : r.start;
    const origDur = i < s.length ? src.dur : dur;
    return clone(src, {
      start: lerp(origStart, r.start),
      dur: Math.max(T16 / 2, lerp(origDur, dur)),
      art: r.accent ? 'accent' : src.art === 'accent' ? undefined : src.art,
    });
  });
}

/** Metric weight of a position within the bar (1 = downbeat). */
export function metricWeight(tick: number, meter: Meter): number {
  const beat = (TPQ * 4) / meter.den;
  const bar = beat * meter.num;
  const t = ((tick % bar) + bar) % bar;
  if (t === 0) return 1;
  if (meter.num % 2 === 0 && t === bar / 2) return 0.8;
  if (t % beat === 0) return 0.6;
  if (t % (beat / 2) === 0) return 0.35;
  return 0.15;
}

/**
 * Translate a melody's rhythm into a four-lane percussive pattern:
 * kick on strong beats, snare on back beats, hi-hat on off-beats (plus a
 * steady ghost pulse), "other" for sustains and sixteenth-level onsets.
 */
export function melodyToSteps(
  notes: Note[],
  bars: number,
  meter: Meter,
  perBar = 8,
  sensitivity = 0.75,
): StepPattern {
  const barLen = (TPQ * 4 * meter.num) / meter.den;
  const step = barLen / perBar;
  const total = bars * perBar;
  const lanes: Record<Lane, StepValue[]> = {
    hihat: Array.from({ length: total }, () => 1 as StepValue),
    snare: Array.from({ length: total }, () => 0 as StepValue),
    kick: Array.from({ length: total }, () => 0 as StepValue),
    other: Array.from({ length: total }, () => 0 as StepValue),
  };
  const threshold = 1.05 - sensitivity * 0.5;
  for (const n of sorted(notes)) {
    const idx = Math.round(n.start / step);
    if (idx < 0 || idx >= total) continue;
    const pos = idx % perBar;
    const w = metricWeight(n.start, meter);
    const score = (n.vel / 127) * 0.45 + Math.min(1, n.dur / (2 * TPQ)) * 0.35 + w * 0.2;
    const accent = n.art === 'accent' || score >= threshold;
    const v: StepValue = accent ? 3 : 2;
    const onGrid = Math.abs(n.start - idx * step) < step / 4;
    if (!onGrid) {
      lanes.other[idx] = 2;
      continue;
    }
    if (pos === 0 || pos === perBar / 2) lanes.kick[idx] = v;
    else if (pos % (perBar / meter.num) === 0) lanes.snare[idx] = v;
    else lanes.hihat[idx] = v;
    // Mark sustained steps as ghost notes in the "other" lane.
    const held = Math.floor(n.dur / step);
    for (let k = 1; k < held && idx + k < total; k++) {
      if ((idx + k) % 2 === 1) lanes.other[idx + k] = Math.max(lanes.other[idx + k], 1) as StepValue;
    }
    if (pos % 2 === 1 && lanes.snare[idx - 1] === 0) lanes.snare[idx] = Math.max(lanes.snare[idx], 1) as StepValue;
  }
  return { perBar, lanes };
}

/** Rhythm events from a step pattern (any lane "on" is an onset). */
export function stepsToRhythm(pattern: StepPattern, meter: Meter, fromStep = 0, toStep?: number): RhythmEvent[] {
  const barLen = (TPQ * 4 * meter.num) / meter.den;
  const step = barLen / pattern.perBar;
  const end = toStep ?? pattern.lanes.kick.length;
  const onsets: RhythmEvent[] = [];
  for (let i = fromStep; i < end; i++) {
    const vals = [pattern.lanes.kick[i], pattern.lanes.snare[i], pattern.lanes.hihat[i], pattern.lanes.other[i]];
    const on = vals.some((v) => v >= 2);
    if (on) onsets.push({ start: (i - fromStep) * step, dur: step, accent: vals.some((v) => v === 3) });
  }
  for (let i = 0; i < onsets.length; i++) {
    const next = onsets[i + 1];
    onsets[i].dur = (next ? next.start : (end - fromStep) * step) - onsets[i].start;
  }
  return onsets;
}
