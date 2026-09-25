import { TPQ } from './types';
import type { CadenceType, Drawing, KeyRegion, Meter, Note, Project, ScaleRef } from './types';

let counter = 0;
/** Short unique id. */
export function uid(prefix = 'n'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const barTicks = (m: Meter) => (m.num * TPQ * 4) / m.den;
export const beatTicks = (m: Meter) => (TPQ * 4) / m.den;

export interface CadenceInfo {
  label: string;
  /** Label used in the Period Builder's punctuation list. */
  long: string;
  /** Abbreviation on the structure timeline. */
  abbr: string;
  punct: string;
  /** Degree of closure 0–100. */
  closure: number;
  /** Fraction symbol for compact labels. */
  frac: string;
}

export const CADENCES: Record<CadenceType, CadenceInfo> = {
  open: { label: 'Open', long: 'Open', abbr: 'Open', punct: '', closure: 12, frac: '○' },
  quarter: { label: 'Quarter (¼)', long: 'Quarter (¼)', abbr: 'QC', punct: ',', closure: 40, frac: '¼' },
  half: { label: 'Half (½)', long: 'Half (½)', abbr: 'HC', punct: ';', closure: 68, frac: '½' },
  strong: { label: 'Strong', long: 'Strong (¾)', abbr: 'SC', punct: ':', closure: 84, frac: '¾' },
  full: { label: 'Full (I)', long: 'Perfect (I)', abbr: 'PAC', punct: '.', closure: 100, frac: 'I' },
};

export const CADENCE_ORDER: CadenceType[] = ['open', 'quarter', 'half', 'strong', 'full'];

export interface PlacedDrawing {
  drawing: Drawing;
  index: number;
  startBar: number;
  endBar: number;
  startTick: number;
  endTick: number;
}

export function placeDrawings(project: Project): PlacedDrawing[] {
  const bt = barTicks(project.meter);
  let bar = 0;
  return project.drawings.map((drawing, index) => {
    const placed = {
      drawing,
      index,
      startBar: bar,
      endBar: bar + drawing.bars,
      startTick: bar * bt,
      endTick: (bar + drawing.bars) * bt,
    };
    bar += drawing.bars;
    return placed;
  });
}

export function totalBars(project: Project): number {
  return project.drawings.reduce((s, d) => s + d.bars, 0);
}

export function findPlaced(project: Project, drawingId: string): PlacedDrawing | undefined {
  return placeDrawings(project).find((p) => p.drawing.id === drawingId);
}

export interface AbsNote extends Note {
  /** Absolute onset in ticks from the period start. */
  abs: number;
  drawingId: string;
}

export function absoluteNotes(project: Project): AbsNote[] {
  const out: AbsNote[] = [];
  for (const p of placeDrawings(project)) {
    for (const n of p.drawing.notes) out.push({ ...n, abs: p.startTick + n.start, drawingId: p.drawing.id });
  }
  return out.sort((a, b) => a.abs - b.abs || a.pitch - b.pitch);
}

/** Notes rebased so that their start is absolute (for notation/analysis). */
export function asAbsolute(notes: AbsNote[]): Note[] {
  return notes.map((n) => ({ ...n, start: n.abs }));
}

export interface MemberInfo {
  id: string;
  key: string;
  name: string;
  drawingIds: string[];
  startBar: number;
  endBar: number;
  cadence: CadenceType;
}

/** Members are contiguous runs of drawings sharing a member key. */
export function deriveMembers(project: Project): MemberInfo[] {
  const out: MemberInfo[] = [];
  const seen = new Map<string, number>();
  for (const p of placeDrawings(project)) {
    const last = out[out.length - 1];
    if (last && last.key === p.drawing.member) {
      last.drawingIds.push(p.drawing.id);
      last.endBar = p.endBar;
      last.cadence = p.drawing.cadence;
    } else {
      const n = (seen.get(p.drawing.member) ?? 0) + 1;
      seen.set(p.drawing.member, n);
      out.push({
        id: `member:${p.drawing.id}`,
        key: p.drawing.member,
        name: `Member ${p.drawing.member}${n > 1 ? ` (${n})` : ''}`,
        drawingIds: [p.drawing.id],
        startBar: p.startBar,
        endBar: p.endBar,
        cadence: p.drawing.cadence,
      });
    }
  }
  return out;
}

export interface CadencePoint {
  drawingId: string;
  label: string;
  type: CadenceType;
  /** Tick of the arrival note (the point of rest). */
  arrival: number;
  /** Tick where the cadential gesture begins (penultimate onset). */
  gestureStart: number;
  endTick: number;
  /** 1-based bar number the drawing ends in. */
  bar: number;
}

export function cadencePoints(project: Project, includeOpen = false): CadencePoint[] {
  const out: CadencePoint[] = [];
  for (const p of placeDrawings(project)) {
    const d = p.drawing;
    if (d.cadence === 'open' && !includeOpen) continue;
    const sorted = [...d.notes].sort((a, b) => a.start - b.start);
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const arrival = last ? p.startTick + last.start : p.endTick;
    const gestureStart = prev ? p.startTick + prev.start : arrival;
    out.push({
      drawingId: d.id,
      label: d.label,
      type: d.cadence,
      arrival,
      gestureStart,
      endTick: p.endTick,
      bar: p.endBar,
    });
  }
  return out;
}

export type PhraseToken =
  | { kind: 'unit'; drawingId: string; label: string }
  | { kind: 'punct'; drawingId: string; char: string; type: CadenceType };

/** "A1 A2 , A1' A3 ; B1 B2 ." */
export function phraseTokens(project: Project): PhraseToken[] {
  const out: PhraseToken[] = [];
  for (const d of project.drawings) {
    out.push({ kind: 'unit', drawingId: d.id, label: d.label });
    const punct = CADENCES[d.cadence].punct;
    if (punct) out.push({ kind: 'punct', drawingId: d.id, char: punct, type: d.cadence });
  }
  return out;
}

export function regionAtBar(regions: KeyRegion[], bar: number): KeyRegion | undefined {
  return regions.find((r) => bar >= r.start && bar < r.end) ?? regions[regions.length - 1];
}

/** The local key governing a tick (pivot regions resolve to the key they lead into). */
export function scaleAtTick(project: Project, tick: number): ScaleRef {
  const bar = tick / barTicks(project.meter);
  const sorted = [...project.regions].sort((a, b) => a.start - b.start);
  const idx = sorted.findIndex((r) => bar >= r.start && bar < r.end);
  if (idx < 0) return project.key;
  const r = sorted[idx];
  if (r.pivot && sorted[idx + 1]) return sorted[idx + 1].scale;
  return r.scale;
}

export function barLabel(bar0: number): string {
  return `Bar ${Math.floor(bar0) + 1}`;
}

export function notesInRange(notes: AbsNote[], from: number, to: number): AbsNote[] {
  return notes.filter((n) => n.abs >= from && n.abs < to);
}
