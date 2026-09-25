import { describe, expect, it } from 'vitest';
import { buildBars, splitSpan, engrave, compactMapping } from '../src/notation/layout';
import { mel } from '../src/model/dsl';

const meter = { num: 4, den: 4 };

describe('notation', () => {
  it('splits spans into notatable values', () => {
    expect(splitSpan(0, 16, 16, 4)).toEqual([16]);
    expect(splitSpan(0, 12, 16, 4)).toEqual([12]);
    expect(splitSpan(1, 3, 16, 4)).toEqual([1, 2]);
    expect(splitSpan(0, 10, 16, 4, true)).toEqual([8, 2]);
  });
  it('builds bars with rests, ties and accidentals', () => {
    const notes = mel('C4/4 B3/4 B3/4 r/4 | Bb4/12 F#4/8 | G4/4');
    const bars = buildBars(notes, { clef: 'treble', fifths: -3, meter, from: 0, to: 3 * 16 * 120 });
    expect(bars).toHaveLength(3);
    const b0 = bars[0].events;
    expect(b0.map((e) => e.kind)).toEqual(['note', 'note', 'note', 'rest']);
    expect(b0[1].heads[0].acc).toBe(0); // natural on B
    expect(b0[2].heads[0].acc).toBeUndefined(); // carried through the bar
    const b1 = bars[1].events;
    expect(b1[0].len16).toBe(12);
    expect(b1[1].heads[0].tieToNext).toBe(true);
    expect(bars[2].events[0].heads[0].tieFromPrev).toBe(true);
  });
  it('beams eighths by beat and engraves without NaN', () => {
    const notes = mel('C5/2 D5/2 Eb5/2 F5/2 G5/4 C5/1 D5/1 Eb5/2');
    const opts = { clef: 'treble' as const, fifths: -3, meter, from: 0, to: 16 * 120 };
    const bars = buildBars(notes, opts);
    const beams = new Set(bars[0].events.map((e) => e.beam).filter(Boolean));
    expect(beams.size).toBe(2);
    const geo = { sp: 8, top: 20, left: 0, right: 400, preludeX: 0, finalBar: true };
    const out = engrave(bars, opts, geo, compactMapping(bars, 60, 330, 8));
    const json = JSON.stringify(out.prims);
    expect(json.includes('NaN')).toBe(false);
    expect(out.heads.size).toBe(notes.length);
  });
});
