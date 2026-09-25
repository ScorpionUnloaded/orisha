/** Descriptive analysis: contour, symmetry, rhythm character, similarity, density. */
import { toDegree } from './theory';
import { metricWeight, sorted } from './transforms';
import type { ContourShape } from './transforms';
import { T16, T8, TPQ } from './types';
import type { Meter, Note, ScaleRef } from './types';

export const CONTOUR_LABEL: Record<ContourShape, string> = {
  arch: 'Arch (∩)',
  valley: 'Valley (∪)',
  ascending: 'Ascending (↗)',
  descending: 'Descending (↘)',
  wave: 'Wave (∿)',
  flat: 'Flat (—)',
};

export function pitchRange(notes: Note[]): [number, number] | null {
  if (!notes.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    lo = Math.min(lo, n.pitch);
    hi = Math.max(hi, n.pitch);
  }
  return [lo, hi];
}

/** Classify the overall melodic contour of a note list. */
export function classifyContour(notes: Note[]): ContourShape {
  const s = sorted(notes);
  if (s.length < 3) {
    if (s.length === 2) return s[1].pitch > s[0].pitch ? 'ascending' : s[1].pitch < s[0].pitch ? 'descending' : 'flat';
    return 'flat';
  }
  const p = s.map((n) => n.pitch);
  const lo = Math.min(...p);
  const hi = Math.max(...p);
  const range = hi - lo;
  if (range < 2) return 'flat';
  const first = p[0];
  const last = p[p.length - 1];
  const iMax = p.indexOf(hi);
  const iMin = p.indexOf(lo);
  const n = p.length - 1;
  const inMiddle = (i: number) => i / n > 0.15 && i / n < 0.85;
  // Count direction changes with hysteresis so neighbour-note wiggles do not register.
  const hyst = Math.max(3, range * 0.3);
  let turns = 0;
  let dir = 0;
  let extreme = p[0];
  for (let i = 1; i <= n; i++) {
    const v = p[i];
    if (dir >= 0 && v > extreme) extreme = v;
    else if (dir <= 0 && v < extreme) extreme = v;
    if (dir >= 0 && extreme - v >= hyst) {
      if (dir > 0) turns++;
      dir = -1;
      extreme = v;
    } else if (dir <= 0 && v - extreme >= hyst) {
      if (dir < 0) turns++;
      dir = 1;
      extreme = v;
    }
  }
  if (inMiddle(iMax) && hi - first >= range * 0.4 && hi - last >= range * 0.4 && turns <= 2) return 'arch';
  if (inMiddle(iMin) && first - lo >= range * 0.4 && last - lo >= range * 0.4 && turns <= 2) return 'valley';
  if (last - first >= range * 0.5) return 'ascending';
  if (first - last >= range * 0.5) return 'descending';
  if (inMiddle(iMax)) return turns > 2 ? 'wave' : 'arch';
  return 'wave';
}

/** Resample the pitch profile of a note list onto `k` evenly spaced points in [0, length). */
function profile(notes: Note[], length: number, k = 16): number[] {
  const s = sorted(notes);
  if (!s.length) return new Array(k).fill(0);
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const t = ((i + 0.5) / k) * length;
    let cur = s[0];
    for (const n of s) if (n.start <= t) cur = n;
    out.push(cur.pitch);
  }
  const mean = out.reduce((a, b) => a + b, 0) / k;
  return out.map((v) => v - mean);
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (aa === 0 && bb === 0) return 1;
  if (aa === 0 || bb === 0) return 0;
  return ab / Math.sqrt(aa * bb);
}

export type SymmetryKind = 'symmetric' | 'near-symmetric' | 'asymmetric';
export const SYMMETRY_LABEL: Record<SymmetryKind, string> = {
  symmetric: 'Symmetric',
  'near-symmetric': 'Near-symmetric',
  asymmetric: 'Asymmetric',
};

/**
 * Symmetry of a unit: the better of (a) mirror correlation of the contour
 * around the midpoint and (b) apex balance — how evenly the ascent and descent
 * share range and time around the melodic peak (or trough).
 */
export function symmetryScore(notes: Note[], length: number): number {
  const s = sorted(notes);
  if (s.length < 3) return 1;
  const prof = profile(s, length, 16);
  const mirror = Math.max(0, correlation(prof, [...prof].reverse()));
  const p = s.map((n) => n.pitch);
  const first = p[0];
  const last = p[p.length - 1];
  const hi = Math.max(...p);
  const lo = Math.min(...p);
  const useHi = hi - (first + last) / 2 >= (first + last) / 2 - lo;
  const apex = useHi ? p.indexOf(hi) : p.indexOf(lo);
  const ascent = Math.abs(p[apex] - first);
  const descent = Math.abs(p[apex] - last);
  const extentBal = 1 - Math.abs(ascent - descent) / Math.max(1, ascent + descent);
  const apexT = (s[apex].start + s[apex].dur / 2) / length;
  const timeBal = 1 - Math.min(1, Math.abs(apexT - 0.5) * 2);
  return Math.max(mirror, extentBal * (0.5 + 0.5 * timeBal));
}

export function classifySymmetry(notes: Note[], length: number): SymmetryKind {
  const s = symmetryScore(notes, length);
  if (s >= 0.85) return 'symmetric';
  if (s >= 0.35) return 'near-symmetric';
  return 'asymmetric';
}

export type RhythmCharacter = 'eighth' | 'quarter' | 'sixteenth' | 'dotted' | 'syncopated' | 'long' | 'mixed';
export const RHYTHM_LABEL: Record<RhythmCharacter, string> = {
  eighth: 'Eighth-based',
  quarter: 'Quarter-based',
  sixteenth: 'Sixteenth-based',
  dotted: 'Dotted',
  syncopated: 'Syncopated',
  long: 'Sustained',
  mixed: 'Mixed',
};

export function classifyRhythm(notes: Note[], meter: Meter = { num: 4, den: 4 }): RhythmCharacter {
  if (!notes.length) return 'mixed';
  const counts = new Map<number, number>();
  for (const n of notes) counts.set(n.dur, (counts.get(n.dur) ?? 0) + 1);
  const total = notes.length;
  const share = (d: number) => (counts.get(d) ?? 0) / total;
  const dotted = notes.filter((n) => [T8 * 1.5, TPQ * 1.5, TPQ * 3].includes(n.dur)).length / total;
  const synco = notes.filter((n) => metricWeight(n.start, meter) < 0.4 && n.dur >= TPQ).length / total;
  if (share(T8) >= 0.6) return 'eighth';
  if (share(T16) >= 0.5) return 'sixteenth';
  if (share(TPQ) >= 0.5) return 'quarter';
  if (dotted >= 0.3) return 'dotted';
  if (synco >= 0.25) return 'syncopated';
  if (notes.every((n) => n.dur >= TPQ * 2)) return 'long';
  return 'mixed';
}

export interface Similarity {
  contour: number;
  rhythm: number;
  interval: number;
  duration: number;
}

function intervals(notes: Note[]): number[] {
  const s = sorted(notes);
  return s.slice(1).map((n, i) => n.pitch - s[i].pitch);
}

/** Compare two phrase units along several axes (0–1 each). */
export function similarity(a: Note[], aLen: number, b: Note[], bLen: number): Similarity {
  const contour = (correlation(profile(a, aLen, 24), profile(b, bLen, 24)) + 1) / 2;
  // Rhythm: onset sets on a normalised 16-step grid.
  const grid = (notes: Note[], len: number) => new Set(notes.map((n) => Math.round((n.start / len) * 32)));
  const ga = grid(a, aLen);
  const gb = grid(b, bLen);
  const inter = [...ga].filter((x) => gb.has(x)).length;
  const union = new Set([...ga, ...gb]).size || 1;
  const rhythm = inter / union;
  // Intervals: element-wise closeness of interval sequences.
  const ia = intervals(a);
  const ib = intervals(b);
  const m = Math.max(ia.length, ib.length) || 1;
  let score = 0;
  for (let i = 0; i < Math.min(ia.length, ib.length); i++) score += Math.max(0, 1 - Math.abs(ia[i] - ib[i]) / 4);
  const interval = score / m;
  // Durations: overlap of normalised duration histograms.
  const hist = (notes: Note[], len: number) => {
    const h = new Map<number, number>();
    for (const n of notes) {
      const k = Math.round((n.dur / len) * 64);
      h.set(k, (h.get(k) ?? 0) + 1 / Math.max(1, notes.length));
    }
    return h;
  };
  const ha = hist(a, aLen);
  const hb = hist(b, bLen);
  let overlap = 0;
  for (const [k, v] of ha) overlap += Math.min(v, hb.get(k) ?? 0);
  return { contour, rhythm, interval, duration: overlap };
}

/**
 * Density fingerprint: one value per step between `from` and `to` (ticks).
 * Onsets score by metric weight, velocity and length; sustains decay; rests are near zero.
 */
export interface DensityCell {
  value: number;
  onset: boolean;
  accent: boolean;
  noteId?: string;
}

export function densityFingerprint(notes: Note[], from: number, to: number, step: number, meter: Meter): DensityCell[] {
  const cells: DensityCell[] = [];
  const s = sorted(notes);
  for (let t = from; t < to; t += step) {
    const onset = s.find((n) => n.start >= t && n.start < t + step);
    if (onset) {
      const w = metricWeight(onset.start, meter);
      const len = Math.min(1, onset.dur / (TPQ * 2));
      const value = Math.min(1, 0.28 + w * 0.3 + len * 0.28 + (onset.vel / 127) * 0.14 + (onset.art === 'accent' ? 0.12 : 0));
      cells.push({ value, onset: true, accent: onset.art === 'accent', noteId: onset.id });
      continue;
    }
    const held = s.find((n) => n.start < t && n.start + n.dur > t);
    if (held) {
      const elapsed = (t - held.start) / held.dur;
      cells.push({ value: 0.34 * (1 - elapsed) + 0.08, onset: false, accent: false, noteId: held.id });
    } else {
      cells.push({ value: 0.04, onset: false, accent: false });
    }
  }
  return cells;
}

/** Structural reduction: the weightiest note in each window. */
export function outline(notes: Note[], window: number, meter: Meter): Note[] {
  const s = sorted(notes);
  if (!s.length) return [];
  const end = Math.max(...s.map((n) => n.start + n.dur));
  const out: Note[] = [];
  for (let t = 0; t < end; t += window) {
    const cands = s.filter((n) => n.start < t + window && n.start + n.dur > t);
    if (!cands.length) continue;
    let best = cands[0];
    let bestScore = -1;
    for (const n of cands) {
      const overlap = Math.min(n.start + n.dur, t + window) - Math.max(n.start, t);
      const score = overlap / window + metricWeight(n.start, meter) * 0.5;
      if (score > bestScore) {
        best = n;
        bestScore = score;
      }
    }
    out.push({ ...best, id: `${best.id}@${t}`, start: t, dur: window });
  }
  return out;
}

/** Intervallic profile relative to the previous note, in scale steps. */
export function degreeSteps(notes: Note[], scale: ScaleRef): number[] {
  const s = sorted(notes);
  return s.slice(1).map((n, i) => toDegree(n.pitch, scale).d - toDegree(s[i].pitch, scale).d);
}

export function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}
