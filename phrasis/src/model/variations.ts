/** Named variations (motif editor) and the deterministic variation generator. */
import { similarity } from './analysis';
import { snapToScale } from './theory';
import {
  applyContour,
  contourOnly,
  invert,
  retrograde,
  retrogradeInversion,
  rhythmicVariation,
  scalePitch,
  scaleTime,
  sequence,
  sorted,
  transposeDiatonic,
} from './transforms';
import type { ContourShape } from './transforms';
import type { Note, ScaleRef } from './types';

export type VariationId =
  | 'original'
  | 'transpose'
  | 'invert'
  | 'retrograde'
  | 'augment'
  | 'diminish'
  | 'rhythmic'
  | 'contour'
  | 'sequence';

export const VARIATIONS: Array<{ id: VariationId; card: string; tile: string }> = [
  { id: 'original', card: 'Original', tile: 'Original' },
  { id: 'transpose', card: 'Transpose +3', tile: 'Transpose' },
  { id: 'invert', card: 'Invert', tile: 'Invert' },
  { id: 'retrograde', card: 'Retrograde', tile: 'Retrograde' },
  { id: 'augment', card: 'Augment (2×)', tile: 'Augment' },
  { id: 'diminish', card: 'Diminish (1/2)', tile: 'Diminish' },
  { id: 'rhythmic', card: 'Rhythmic Variation', tile: 'Rhythmic' },
  { id: 'contour', card: 'Contour Only', tile: 'Contour' },
  { id: 'sequence', card: 'Sequence (+2)', tile: 'Combine' },
];

export function variation(id: VariationId, notes: Note[], length: number, scale: ScaleRef): { notes: Note[]; length: number } {
  switch (id) {
    case 'transpose':
      return { notes: transposeDiatonic(notes, 3, scale), length };
    case 'invert':
      return { notes: invert(notes, scale), length };
    case 'retrograde':
      return { notes: retrograde(notes, length), length };
    case 'augment':
      return { notes: scaleTime(notes, 2), length: length * 2 };
    case 'diminish':
      return { notes: scaleTime(notes, 0.5), length: length / 2 };
    case 'rhythmic':
      return { notes: rhythmicVariation(notes), length };
    case 'contour':
      return { notes: contourOnly(notes, scale), length };
    case 'sequence':
      return { notes: sequence(notes, 2, length, scale), length };
    default:
      return { notes: notes.map((n) => ({ ...n })), length };
  }
}

export interface GenerateOptions {
  preserveCadence: boolean;
  preserveLength: boolean;
  preserveRhythm: boolean;
  preserveScale: boolean;
  varyContour: boolean;
  varyIntervals: boolean;
  /** 0–1: how far proposals may drift from the source. */
  distance: number;
}

export interface Proposal {
  notes: Note[];
  recipe: string[];
  distance: number;
}

type Op = { name: string; weight: number; pitchOnly: boolean; changesLength?: boolean; fn: (n: Note[], len: number, s: ScaleRef) => Note[] };

const SHAPES: ContourShape[] = ['arch', 'valley', 'ascending', 'descending', 'wave'];

function ops(opts: GenerateOptions): Op[] {
  const list: Op[] = [];
  if (opts.varyIntervals) {
    list.push({ name: 'Transpose +1', weight: 0.15, pitchOnly: true, fn: (n, _l, s) => transposeDiatonic(n, 1, s) });
    list.push({ name: 'Transpose −2', weight: 0.2, pitchOnly: true, fn: (n, _l, s) => transposeDiatonic(n, -2, s) });
    list.push({ name: 'Stretch intervals ×1.5', weight: 0.35, pitchOnly: true, fn: (n, _l, s) => scalePitch(n, 1.5, s) });
    list.push({ name: 'Compress intervals ×0.5', weight: 0.3, pitchOnly: true, fn: (n, _l, s) => scalePitch(n, 0.5, s) });
    list.push({ name: 'Contour only (steps)', weight: 0.3, pitchOnly: true, fn: (n, _l, s) => contourOnly(n, s) });
  }
  if (opts.varyContour) {
    list.push({ name: 'Invert', weight: 0.5, pitchOnly: true, fn: (n, _l, s) => invert(n, s) });
    for (const shape of SHAPES) list.push({ name: `Contour → ${shape}`, weight: 0.45, pitchOnly: true, fn: (n, l, s) => applyContour(n, shape, l, s) });
    list.push({ name: 'Sequence +2', weight: 0.4, pitchOnly: false, fn: (n, l, s) => sequence(n, 2, l, s) });
  }
  if (!opts.preserveRhythm) {
    list.push({ name: 'Retrograde', weight: 0.55, pitchOnly: false, fn: (n, l) => retrograde(n, l) });
    list.push({ name: 'Retrograde inversion', weight: 0.7, pitchOnly: false, fn: (n, l, s) => retrogradeInversion(n, l, s) });
    list.push({ name: 'Dotted rhythm', weight: 0.3, pitchOnly: false, fn: (n) => rhythmicVariation(n) });
  }
  return list;
}

/** Deterministically generate `count` proposals ordered by closeness to the target distance. */
export function generateVariations(notes: Note[], length: number, scale: ScaleRef, opts: GenerateOptions, count = 8): Proposal[] {
  const available = ops(opts).filter((o) => !(opts.preserveRhythm && !o.pitchOnly) && !(opts.preserveLength && o.changesLength));
  if (!available.length || !notes.length) return [];
  const src = sorted(notes);
  const last = src[src.length - 1];
  const combos: Op[][] = [];
  for (const a of available) combos.push([a]);
  for (let i = 0; i < available.length; i++) for (let j = i + 1; j < available.length; j++) combos.push([available[i], available[j]]);
  const results: Proposal[] = combos.map((combo) => {
    let out = src;
    for (const op of combo) out = op.fn(out, length, scale);
    out = sorted(out);
    if (opts.preserveScale) out = out.map((n) => ({ ...n, pitch: snapToScale(n.pitch, scale) }));
    if (opts.preserveCadence && out.length) {
      const final = out[out.length - 1];
      out = [...out.slice(0, -1), { ...final, pitch: last.pitch, start: last.start, dur: last.dur }];
    }
    const sim = similarity(src, length, out, length);
    const d = 1 - (sim.contour * 0.4 + sim.interval * 0.4 + sim.rhythm * 0.2);
    return { notes: out, recipe: combo.map((o) => o.name), distance: d };
  });
  const seen = new Set<string>();
  return results
    .filter((r) => {
      const key = r.notes.map((n) => `${n.pitch}@${n.start}`).join(',');
      if (seen.has(key) || key === src.map((n) => `${n.pitch}@${n.start}`).join(',')) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Math.abs(a.distance - opts.distance) - Math.abs(b.distance - opts.distance))
    .slice(0, count);
}
