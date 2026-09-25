import { parsePitch } from './theory';
import { uid } from './syntax';
import { T16 } from './types';
import type { Note } from './types';

/**
 * Tiny melody notation used for built-in content.
 *   "C4/4 D4/4 Eb4/2> F4/2. | G4/8( r/4 A4/4)"
 * Each token is pitch/duration-in-sixteenths, followed by optional marks:
 *   >  accent    .  staccato    -  tenuto    (  slur start    )  slur end
 * "r" is a rest; "|" is an optional bar separator.
 */
export function mel(src: string, vel = 86): Note[] {
  const out: Note[] = [];
  let t = 0;
  for (const tok of src.split(/\s+/).filter(Boolean)) {
    if (tok === '|') continue;
    const m = /^(r|[A-Ga-g](?:##|#|bb|b|n)?-?\d)\/(\d+(?:\.\d+)?)([>.\-()]*)$/.exec(tok);
    if (!m) throw new Error(`Bad token "${tok}"`);
    const dur = Number(m[2]) * T16;
    if (m[1] !== 'r') {
      const marks = m[3];
      const note: Note = { id: uid('n'), pitch: parsePitch(m[1]), start: t, dur, vel };
      if (marks.includes('>')) {
        note.art = 'accent';
        note.vel = Math.min(127, vel + 22);
      } else if (marks.includes('.')) note.art = 'staccato';
      else if (marks.includes('-')) note.art = 'tenuto';
      if (marks.includes('(')) note.slur = 'start';
      if (marks.includes(')')) note.slur = 'end';
      out.push(note);
    }
    t += dur;
  }
  return out;
}

/** Shift notes in time (ticks). */
export function shift(notes: Note[], ticks: number): Note[] {
  return notes.map((n) => ({ ...n, id: uid('n'), start: n.start + ticks }));
}
