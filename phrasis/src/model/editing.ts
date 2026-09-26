/**
 * Note-level editing shared by the piano roll (FL Studio–style tools) and the
 * staves (Sibelius-style note input). Every function is pure: notes carry
 * absolute `start` ticks, inputs are never mutated, and each operation returns
 * the new note list plus the ids that should be selected afterwards.
 */
import { uid } from './syntax';
import { fromDegree, toDegree } from './theory';
import { T16 } from './types';
import type { Note, ScaleRef } from './types';

export type Ids = ReadonlySet<string>;

export interface EditResult {
  notes: Note[];
  /** Selection after the edit (undefined keeps the current one). */
  sel?: string[];
}

/** Shortest duration any edit may leave behind (a 32nd). */
export const MIN_DUR = T16 / 2;

const byStart = (a: Note, b: Note) => a.start - b.start || a.pitch - b.pitch;
const clampPitch = (p: number) => Math.max(21, Math.min(108, p));
const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)));
const end = (n: Note) => n.start + n.dur;

/** Onset and end of a set of notes. */
export function span(notes: Note[]): { from: number; to: number } | null {
  if (!notes.length) return null;
  let from = Infinity;
  let to = -Infinity;
  for (const n of notes) {
    from = Math.min(from, n.start);
    to = Math.max(to, end(n));
  }
  return { from, to };
}

function pick(notes: Note[], ids: Ids): Note[] {
  return notes.filter((n) => ids.has(n.id));
}

/** Replace selected notes through `fn`, keeping everything else untouched. */
function mapSel(notes: Note[], ids: Ids, fn: (n: Note) => Note): Note[] {
  return notes.map((n) => (ids.has(n.id) ? fn(n) : n));
}

/** Group notes that share an onset (chords), in time order. */
export function chords(notes: Note[]): Note[][] {
  const out: Note[][] = [];
  for (const n of [...notes].sort(byStart)) {
    const last = out[out.length - 1];
    if (last && last[0].start === n.start) last.push(n);
    else out.push([n]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Timing

/** Quantize onsets (and optionally ends) toward a grid; strength 0–1. */
export function quantizeNotes(notes: Note[], ids: Ids, grid: number, opts: { ends?: boolean; strength?: number } = {}): EditResult {
  const k = opts.strength ?? 1;
  const g = Math.max(1, grid);
  return {
    notes: mapSel(notes, ids, (n) => {
      const target = Math.round(n.start / g) * g;
      const start = Math.max(0, Math.round(n.start + (target - n.start) * k));
      if (!opts.ends) return { ...n, start };
      const endTarget = Math.max(target + g, Math.round(end(n) / g) * g);
      const e = Math.round(end(n) + (endTarget - end(n)) * k);
      return { ...n, start, dur: Math.max(MIN_DUR, e - start) };
    }),
  };
}

/** Quick legato: every selected note lasts until the next selected onset. */
export function legato(notes: Note[], ids: Ids): EditResult {
  const onsets = Array.from(new Set(pick(notes, ids).map((n) => n.start))).sort((a, b) => a - b);
  return {
    notes: mapSel(notes, ids, (n) => {
      const next = onsets.find((t) => t > n.start);
      return next === undefined ? n : { ...n, dur: next - n.start };
    }),
  };
}

/** Glue (tie): merge touching or overlapping selected notes of the same pitch. */
export function glue(notes: Note[], ids: Ids): EditResult {
  const sel = pick(notes, ids).sort(byStart);
  const merged = new Map<string, Note>();
  const gone = new Set<string>();
  const open = new Map<number, Note>();
  for (const n of sel) {
    const cur = open.get(n.pitch);
    if (cur && n.start <= end(cur)) {
      cur.dur = Math.max(end(cur), end(n)) - cur.start;
      if (n.slur === 'end') cur.slur = cur.slur === 'start' ? undefined : 'end';
      gone.add(n.id);
    } else {
      const copy = { ...n };
      merged.set(n.id, copy);
      open.set(n.pitch, copy);
    }
  }
  return {
    notes: notes.filter((n) => !gone.has(n.id)).map((n) => merged.get(n.id) ?? n),
    sel: Array.from(merged.keys()),
  };
}

/** Chop: cut every selected note into pieces of `grid` ticks. */
export function chop(notes: Note[], ids: Ids, grid: number): EditResult {
  const g = Math.max(MIN_DUR, grid);
  const out: Note[] = [];
  const sel: string[] = [];
  for (const n of notes) {
    if (!ids.has(n.id) || n.dur <= g) {
      out.push(n);
      if (ids.has(n.id)) sel.push(n.id);
      continue;
    }
    // Cuts fall on the grid, so a note that starts off-grid keeps a short first piece.
    let t = n.start;
    let first = true;
    while (t < end(n) - MIN_DUR / 2) {
      const next = Math.min(end(n), (Math.floor(t / g) + 1) * g);
      const piece: Note = { ...n, id: first ? n.id : uid('n'), start: t, dur: next - t, slur: undefined, art: first ? n.art : undefined };
      out.push(piece);
      sel.push(piece.id);
      t = next;
      first = false;
    }
  }
  return { notes: out, sel };
}

/** Split notes that span `tick` into two (the slice tool). */
export function splitAt(notes: Note[], ids: Ids, tick: number): EditResult {
  const out: Note[] = [];
  const sel: string[] = [];
  for (const n of notes) {
    if (!ids.has(n.id) || tick <= n.start + MIN_DUR / 2 || tick >= end(n) - MIN_DUR / 2) {
      out.push(n);
      continue;
    }
    const tail: Note = { ...n, id: uid('n'), start: tick, dur: end(n) - tick, art: undefined, slur: n.slur === 'end' ? 'end' : undefined };
    out.push({ ...n, dur: tick - n.start, slur: n.slur === 'start' ? 'start' : undefined }, tail);
    sel.push(n.id, tail.id);
  }
  return { notes: out, sel: sel.length ? sel : undefined };
}

/** Strum chords: offset each voice by `step`, keeping note ends. */
export function strum(notes: Note[], ids: Ids, step: number, dir: 'up' | 'down' = 'up'): EditResult {
  const shift = new Map<string, number>();
  for (const c of chords(pick(notes, ids))) {
    const voices = [...c].sort((a, b) => (dir === 'up' ? a.pitch - b.pitch : b.pitch - a.pitch));
    voices.forEach((n, i) => shift.set(n.id, i * step));
  }
  return {
    notes: mapSel(notes, ids, (n) => {
      const d = Math.min(shift.get(n.id) ?? 0, n.dur - MIN_DUR);
      return { ...n, start: n.start + d, dur: n.dur - d };
    }),
  };
}

export type ArpPattern = 'up' | 'down' | 'updown';

/** Arpeggiate: spread each selected chord over its length in `step` notes. */
export function arpeggiate(notes: Note[], ids: Ids, step: number, pattern: ArpPattern = 'up'): EditResult {
  const groups = chords(pick(notes, ids)).filter((c) => c.length > 1);
  if (!groups.length) return { notes };
  const remove = new Set(groups.flat().map((n) => n.id));
  const added: Note[] = [];
  const onsets = Array.from(new Set(pick(notes, ids).map((n) => n.start))).sort((a, b) => a - b);
  for (const c of groups) {
    const up = [...c].sort((a, b) => a.pitch - b.pitch);
    const order = pattern === 'up' ? up : pattern === 'down' ? [...up].reverse() : [...up, ...up.slice(1, -1).reverse()];
    const from = c[0].start;
    const next = onsets.find((t) => t > from);
    const to = Math.min(next ?? Infinity, Math.max(...c.map(end)));
    let i = 0;
    for (let t = from; t < to - MIN_DUR / 2; t += step, i++) {
      const src = order[i % order.length];
      added.push({ ...src, id: uid('n'), start: t, dur: Math.min(step, to - t), slur: undefined, art: i === 0 ? src.art : undefined });
    }
  }
  return { notes: [...notes.filter((n) => !remove.has(n.id)), ...added], sel: [...pick(notes, ids).filter((n) => !remove.has(n.id)).map((n) => n.id), ...added.map((n) => n.id)] };
}

/** Flip in time: mirror the selection inside its own span (retrograde). */
export function flipTime(notes: Note[], ids: Ids): EditResult {
  const s = span(pick(notes, ids));
  if (!s) return { notes };
  return {
    notes: mapSel(notes, ids, (n) => ({
      ...n,
      start: s.from + (s.to - end(n)),
      slur: n.slur === 'start' ? 'end' : n.slur === 'end' ? 'start' : undefined,
    })),
  };
}

/** Flip in pitch: mirror around the centre of the selection's range (diatonic when a scale is given). */
export function flipPitch(notes: Note[], ids: Ids, scale?: ScaleRef): EditResult {
  const sel = pick(notes, ids);
  if (!sel.length) return { notes };
  if (!scale) {
    const lo = Math.min(...sel.map((n) => n.pitch));
    const hi = Math.max(...sel.map((n) => n.pitch));
    return { notes: mapSel(notes, ids, (n) => ({ ...n, pitch: lo + hi - n.pitch })) };
  }
  const degs = sel.map((n) => toDegree(n.pitch, scale).d);
  const lo = Math.min(...degs);
  const hi = Math.max(...degs);
  return {
    notes: mapSel(notes, ids, (n) => {
      const d = toDegree(n.pitch, scale);
      return { ...n, pitch: clampPitch(fromDegree({ d: lo + hi - d.d, c: -d.c }, scale)) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Pitch

/** Transpose by semitones, or by scale degrees in the scale governing each note. */
export function transpose(notes: Note[], ids: Ids, amount: number, mode: 'chromatic' | 'diatonic', scaleAt?: (tick: number) => ScaleRef): EditResult {
  if (!amount) return { notes };
  return {
    notes: mapSel(notes, ids, (n) => {
      if (mode === 'chromatic' || !scaleAt) return { ...n, pitch: clampPitch(n.pitch + amount) };
      const scale = scaleAt(n.start);
      const d = toDegree(n.pitch, scale);
      return { ...n, pitch: clampPitch(fromDegree({ d: d.d + amount, c: d.c }, scale)) };
    }),
  };
}

/** Limit: fold notes by octaves into [lo, hi]. */
export function limitRange(notes: Note[], ids: Ids, lo: number, hi: number): EditResult {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi, a + 11);
  return {
    notes: mapSel(notes, ids, (n) => {
      let p = n.pitch;
      while (p < a) p += 12;
      while (p > b) p -= 12;
      return { ...n, pitch: clampPitch(p) };
    }),
  };
}

/** Move out-of-scale notes to the nearest scale tone (ties resolve downward). */
export function snapPitches(notes: Note[], ids: Ids, scaleAt: (tick: number) => ScaleRef): EditResult {
  return {
    notes: mapSel(notes, ids, (n) => {
      const scale = scaleAt(n.start);
      const d = toDegree(n.pitch, scale);
      return d.c === 0 ? n : { ...n, pitch: fromDegree({ d: d.d, c: 0 }, scale) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Velocity and humanising

export type VelocityOp =
  | { kind: 'set'; value: number }
  | { kind: 'scale'; factor: number }
  | { kind: 'add'; delta: number }
  | { kind: 'ramp'; from: number; to: number };

export function velocities(notes: Note[], ids: Ids, op: VelocityOp): EditResult {
  const onsets = pick(notes, ids).map((n) => n.start);
  const first = Math.min(...onsets);
  const last = Math.max(...onsets);
  return {
    notes: mapSel(notes, ids, (n) => {
      switch (op.kind) {
        case 'set':
          return { ...n, vel: clampVel(op.value) };
        case 'scale':
          return { ...n, vel: clampVel(n.vel * op.factor) };
        case 'add':
          return { ...n, vel: clampVel(n.vel + op.delta) };
        case 'ramp': {
          const t = last > first ? (n.start - first) / (last - first) : 0;
          return { ...n, vel: clampVel(op.from + (op.to - op.from) * t) };
        }
      }
    }),
  };
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomizeOptions {
  /** ± velocity units. */
  velocity: number;
  /** ± ticks on the onset. */
  timing: number;
  /** ± scale steps (0 leaves pitches alone). */
  pitch: number;
  scaleAt?: (tick: number) => ScaleRef;
}

/** Randomize / humanize velocity, timing and (optionally) pitch, reproducibly from `seed`. */
export function randomize(notes: Note[], ids: Ids, opts: RandomizeOptions, seed: number): EditResult {
  const r = rng(seed);
  const signed = () => r() * 2 - 1;
  return {
    notes: mapSel(notes, ids, (n) => {
      const out = { ...n };
      if (opts.velocity) out.vel = clampVel(n.vel + signed() * opts.velocity);
      if (opts.timing) out.start = Math.max(0, Math.round(n.start + signed() * opts.timing));
      if (opts.pitch) {
        const steps = Math.round(signed() * opts.pitch);
        if (steps) {
          if (opts.scaleAt) {
            const scale = opts.scaleAt(n.start);
            const d = toDegree(n.pitch, scale);
            out.pitch = clampPitch(fromDegree({ d: d.d + steps, c: 0 }, scale));
          } else out.pitch = clampPitch(n.pitch + steps);
        }
      }
      return out;
    }),
  };
}

export function toggleMute(notes: Note[], ids: Ids): EditResult {
  const mute = pick(notes, ids).some((n) => !n.mute);
  return { notes: mapSel(notes, ids, (n) => ({ ...n, mute: mute || undefined })) };
}

/** Put a phrasing slur over the selection, or remove it if it is already there. */
export function toggleSlur(notes: Note[], ids: Ids): EditResult {
  const sel = pick(notes, ids).sort(byStart);
  if (sel.length < 2) {
    return { notes: mapSel(notes, ids, (n) => ({ ...n, slur: undefined })) };
  }
  const first = sel[0].id;
  const last = sel[sel.length - 1].id;
  const has = sel[0].slur === 'start' && sel[sel.length - 1].slur === 'end';
  return {
    notes: mapSel(notes, ids, (n) => ({ ...n, slur: has ? undefined : n.id === first ? 'start' : n.id === last ? 'end' : undefined })),
  };
}

// ---------------------------------------------------------------------------
// Lengths

/** Drag the left edge: move onsets by `d` while keeping ends. */
export function resizeStart(notes: Note[], ids: Ids, d: number): EditResult {
  return {
    notes: mapSel(notes, ids, (n) => {
      const start = Math.max(0, Math.min(end(n) - MIN_DUR, n.start + d));
      return { ...n, start, dur: end(n) - start };
    }),
  };
}

/** Remove whatever sounds in [from, to): notes starting there go, notes running into it are cut short. */
export function clearRange(notes: Note[], from: number, to: number, keep: Ids = new Set()): Note[] {
  const out: Note[] = [];
  for (const n of notes) {
    if (keep.has(n.id)) out.push(n);
    else if (n.start >= from && n.start < to) continue;
    else if (n.start < from && end(n) > from) out.push({ ...n, dur: Math.max(MIN_DUR, from - n.start) });
    else out.push(n);
  }
  return out;
}

/**
 * Set the written length of selected notes, notation-style: a longer note
 * overwrites what follows it, a shorter one leaves a rest.
 */
export function setDurations(notes: Note[], ids: Ids, dur: number): EditResult {
  let out = [...notes];
  for (const c of chords(pick(notes, ids))) {
    if (!out.some((n) => n.id === c[0].id)) continue; // overwritten by an earlier note
    const chordIds = new Set(c.map((n) => n.id));
    out = out.map((n) => (chordIds.has(n.id) ? { ...n, dur } : n));
    out = out.filter((n) => chordIds.has(n.id) || n.start <= c[0].start || n.start >= c[0].start + dur);
  }
  return { notes: out, sel: out.filter((n) => ids.has(n.id)).map((n) => n.id) };
}

// ---------------------------------------------------------------------------
// Clipboard, duplicate, space

/** Notes rebased to `origin` for the clipboard. */
export function toClip(notes: Note[], ids: Ids, origin?: number): Note[] {
  const sel = pick(notes, ids);
  const from = origin ?? span(sel)?.from ?? 0;
  return sel.map((n) => ({ ...n, start: n.start - from })).sort(byStart);
}

/** Insert clipboard notes at `at` with fresh ids; `limit` drops what falls past the end. */
export function paste(notes: Note[], clip: Note[], at: number, limit = Infinity): EditResult {
  const added = clip.map((n) => ({ ...n, id: uid('n'), start: n.start + at })).filter((n) => n.start < limit);
  return { notes: [...notes, ...added], sel: added.map((n) => n.id) };
}

/** Length a duplicate is offset by: the selection's span rounded out to `grid`. */
export function duplicateOffset(sel: Note[], grid: number): number {
  const s = span(sel);
  if (!s) return 0;
  const g = Math.max(1, grid);
  return Math.max(g, Math.ceil(s.to / g) * g - Math.floor(s.from / g) * g);
}

/** Duplicate the selection right after itself. */
export function duplicate(notes: Note[], ids: Ids, offset: number, limit = Infinity): EditResult {
  if (!notes.some((n) => ids.has(n.id))) return { notes };
  return paste(notes, toClip(notes, ids, 0), offset, limit);
}

/** Insert `len` ticks of silence at `at`, pushing later notes right. */
export function insertTime(notes: Note[], at: number, len: number, limit = Infinity): EditResult {
  return { notes: notes.map((n) => (n.start >= at ? { ...n, start: n.start + len } : n)).filter((n) => n.start < limit) };
}

/** Delete the time range [from, to), pulling later notes left. */
export function deleteTime(notes: Note[], from: number, to: number): EditResult {
  const len = to - from;
  const out: Note[] = [];
  for (const n of clearRange(notes, from, to)) out.push(n.start >= to ? { ...n, start: n.start - len } : n);
  return { notes: out };
}

// ---------------------------------------------------------------------------
// Selection helpers

export function selectSamePitch(notes: Note[], ids: Ids): string[] {
  const pitches = new Set(pick(notes, ids).map((n) => n.pitch));
  return notes.filter((n) => pitches.has(n.pitch)).map((n) => n.id);
}

export function selectInRange(notes: Note[], from: number, to: number): string[] {
  return notes.filter((n) => n.start >= from && n.start < to).map((n) => n.id);
}

export function invertSelection(notes: Note[], ids: Ids): string[] {
  return notes.filter((n) => !ids.has(n.id)).map((n) => n.id);
}

/** Every other onset of the selection (odd = 1st, 3rd, …). */
export function selectAlternate(notes: Note[], ids: Ids, odd: boolean): string[] {
  return chords(pick(notes, ids))
    .filter((_, i) => (i % 2 === 0) === odd)
    .flat()
    .map((n) => n.id);
}

/**
 * The chord before or after the current selection, the way arrow keys walk
 * through a score. With nothing selected, the first (or last) onset at or after `from`.
 */
export function adjacentChord(notes: Note[], ids: Ids, dir: 1 | -1, from = 0): Note[] {
  const cs = chords(notes);
  if (!cs.length) return [];
  const sel = pick(notes, ids);
  if (!sel.length) {
    const visible = cs.filter((c) => c[0].start >= from);
    return (dir > 0 ? visible[0] : visible[visible.length - 1]) ?? cs[0];
  }
  const edge = dir > 0 ? Math.max(...sel.map((n) => n.start)) : Math.min(...sel.map((n) => n.start));
  const next = dir > 0 ? cs.find((c) => c[0].start > edge) : [...cs].reverse().find((c) => c[0].start < edge);
  return next ?? [];
}

// ---------------------------------------------------------------------------
// Chord stamps

export type ChordKind = 'none' | 'major' | 'minor' | 'dim' | 'aug' | 'sus2' | 'sus4' | 'dom7' | 'maj7' | 'min7' | 'power' | 'octave' | 'triad' | 'seventh';

export const CHORDS: Record<ChordKind, { label: string; intervals?: number[]; degrees?: number[] }> = {
  none: { label: 'No stamp' },
  triad: { label: 'Scale triad', degrees: [0, 2, 4] },
  seventh: { label: 'Scale 7th', degrees: [0, 2, 4, 6] },
  major: { label: 'Major', intervals: [0, 4, 7] },
  minor: { label: 'Minor', intervals: [0, 3, 7] },
  dim: { label: 'Diminished', intervals: [0, 3, 6] },
  aug: { label: 'Augmented', intervals: [0, 4, 8] },
  sus2: { label: 'Sus2', intervals: [0, 2, 7] },
  sus4: { label: 'Sus4', intervals: [0, 5, 7] },
  dom7: { label: 'Dominant 7', intervals: [0, 4, 7, 10] },
  maj7: { label: 'Major 7', intervals: [0, 4, 7, 11] },
  min7: { label: 'Minor 7', intervals: [0, 3, 7, 10] },
  power: { label: 'Power (5)', intervals: [0, 7] },
  octave: { label: 'Octave', intervals: [0, 12] },
};

/** Pitches of a stamped chord on `root` (scale chords are built in `scale`). */
export function chordPitches(kind: ChordKind, root: number, scale?: ScaleRef): number[] {
  const c = CHORDS[kind];
  if (c.degrees && scale) {
    const r = toDegree(root, scale);
    return c.degrees.map((d) => clampPitch(fromDegree({ d: r.d + d, c: d === 0 ? r.c : 0 }, scale)));
  }
  return (c.intervals ?? [0]).map((i) => clampPitch(root + i));
}
