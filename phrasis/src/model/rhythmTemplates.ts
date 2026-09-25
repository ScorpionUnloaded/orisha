import type { RhythmCharacter } from './analysis';
import type { RhythmEvent } from './transforms';
import { sorted } from './transforms';
import { T16, T8, TPQ } from './types';
import type { Note } from './types';
import { uid } from './syntax';

/** A rhythm that fills `length` ticks in the given character; the last event is held. */
export function rhythmTemplate(kind: RhythmCharacter, length: number): RhythmEvent[] {
  const cells: Record<RhythmCharacter, number[]> = {
    eighth: [T8, T8, T8, T8],
    quarter: [TPQ],
    sixteenth: [T16, T16, T16, T16],
    dotted: [TPQ * 1.5, T8],
    syncopated: [T8, TPQ, T8],
    long: [TPQ * 2],
    mixed: [TPQ, T8, T8, TPQ, TPQ],
  };
  const cell = cells[kind];
  const out: RhythmEvent[] = [];
  let t = 0;
  let i = 0;
  const tail = Math.min(length / 2, TPQ * 2);
  while (t < length - tail) {
    const d = cell[i % cell.length];
    out.push({ start: t, dur: d, accent: false });
    t += d;
    i++;
  }
  out.push({ start: t, dur: length - t, accent: false });
  return out;
}

/** Keep the pitch sequence, spread it over a new rhythm (resampling if counts differ). */
export function rerhythm(notes: Note[], rhythm: RhythmEvent[]): Note[] {
  const s = sorted(notes);
  if (!s.length) return [];
  return rhythm.map((r, i) => {
    const src = s[Math.min(s.length - 1, Math.round((i / Math.max(1, rhythm.length - 1)) * (s.length - 1)))];
    return { ...src, id: uid('n'), start: r.start, dur: r.dur, art: r.accent ? 'accent' : src.art === 'accent' ? undefined : src.art, slur: undefined };
  });
}
