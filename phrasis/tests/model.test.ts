import { describe, expect, it } from 'vitest';
import { demoProject, motifLibrary, recentProjects, COLLECTIONS } from '../src/model/demo';
import { barTicks, cadencePoints, deriveMembers, phraseTokens, placeDrawings, totalBars } from '../src/model/syntax';
import { keyFifths, parsePitch, prettyPitch, pitchName, spellPitch, toDegree, fromDegree, keyLabel, scaleLabel, romanDegree } from '../src/model/theory';
import { invert, retrograde, scaleTime, transposeDiatonic, sequence, applyRhythm, extractRhythm, quantize, swing, remapScale, contourOnly } from '../src/model/transforms';
import { classifyContour, classifyRhythm, similarity } from '../src/model/analysis';
import { mel } from '../src/model/dsl';
import { T16, T8, TPQ } from '../src/model/types';

const C_MINOR = { tonic: 0, mode: 'aeolian' as const };

describe('theory', () => {
  it('parses and names pitches', () => {
    expect(parsePitch('C4')).toBe(60);
    expect(parsePitch('Eb4')).toBe(63);
    expect(parsePitch('F#4')).toBe(66);
    expect(parsePitch('B3')).toBe(59);
    expect(pitchName(63, -3)).toBe('Eb4');
  });
  it('computes key signatures', () => {
    expect(keyFifths(C_MINOR)).toBe(-3);
    expect(keyFifths({ tonic: 7, mode: 'aeolian' })).toBe(-2);
    expect(keyFifths({ tonic: 2, mode: 'dorian' })).toBe(0);
    expect(keyFifths({ tonic: 7, mode: 'major' })).toBe(1);
    expect(keyLabel(C_MINOR)).toBe('C minor');
    expect(scaleLabel(C_MINOR)).toBe('C natural minor');
  });
  it('spells chromatic notes as leading tones', () => {
    expect(prettyPitch(59, -3)).toBe('B3'); // B natural in C minor
    expect(prettyPitch(66, -2)).toBe('F♯4');
    expect(prettyPitch(60, 2)).toBe('C4'); // C natural in D major, not B#
    expect(spellPitch(61, -3)).toEqual({ letter: 0, alter: 1, octave: 4 });
  });
  it('round-trips scale degrees', () => {
    for (let p = 48; p < 84; p++) expect(fromDegree(toDegree(p, C_MINOR), C_MINOR)).toBe(p);
    expect(romanDegree(62, C_MINOR)).toBe('II');
    expect(romanDegree(62, { tonic: 7, mode: 'aeolian' })).toBe('V');
  });
});

describe('built-in content', () => {
  const all = [demoProject(), ...recentProjects()];
  it('fills every drawing exactly', () => {
    for (const p of all) {
      const bt = barTicks(p.meter);
      for (const d of p.drawings) {
        for (const n of d.notes) expect(n.start + n.dur, `${p.name} ${d.label}`).toBeLessThanOrEqual(d.bars * bt);
      }
    }
  });
  it('derives the period grammar', () => {
    const p = demoProject();
    expect(totalBars(p)).toBe(16);
    const tokens = phraseTokens(p).map((t) => (t.kind === 'unit' ? t.label : t.char));
    expect(tokens.join(' ')).toBe("A1 A2 , A1' A3 ; B1 B2 .");
    expect(deriveMembers(p).map((m) => m.name)).toEqual(['Member A', "Member A'", 'Member B']);
    const cps = cadencePoints(p);
    expect(cps.map((c) => c.bar)).toEqual([8, 12, 16]);
    const placed = placeDrawings(p);
    expect(placed[1].startBar).toBe(4);
    expect(cps[0].arrival).toBe(7 * barTicks(p.meter));
  });
  it('has the motif library counts shown in the sidebar', () => {
    const lib = motifLibrary();
    expect(lib).toHaveLength(24);
    const count = (f: (m: (typeof lib)[number]) => boolean) => lib.filter(f).length;
    expect(count((m) => m.category === 'user')).toBe(8);
    expect(count((m) => m.category === 'core')).toBe(12);
    expect(count((m) => m.category === 'rhythmic')).toBe(4);
    expect(count((m) => m.groups.includes('intervals'))).toBe(6);
    expect(count((m) => m.groups.includes('contour'))).toBe(8);
    expect(count((m) => m.favourite)).toBe(3);
    expect(COLLECTIONS.map((c) => count((m) => m.collections.includes(c.id)))).toEqual([5, 7, 4, 6, 5]);
    for (const m of lib) for (const n of m.notes) expect(n.start + n.dur).toBeLessThanOrEqual(m.bars * 16 * T16);
  });
});

describe('transforms', () => {
  const motif = mel('C4/4 D4/4 Eb4/4 G4/4');
  it('transposes diatonically', () => {
    expect(transposeDiatonic(motif, 2, C_MINOR).map((n) => n.pitch)).toEqual([63, 65, 67, 70]);
  });
  it('inverts around the first note', () => {
    expect(invert(motif, C_MINOR).map((n) => n.pitch)).toEqual([60, 58, 56, 53]);
  });
  it('retrogrades inside the span', () => {
    const r = retrograde(motif, 4 * TPQ);
    expect(r.map((n) => n.pitch)).toEqual([67, 63, 62, 60]);
    expect(r[0].start).toBe(0);
  });
  it('augments and diminishes', () => {
    expect(scaleTime(motif, 2).map((n) => n.start)).toEqual([0, 960, 1920, 2880]);
    expect(scaleTime(motif, 0.5).map((n) => n.dur)).toEqual([240, 240, 240, 240]);
  });
  it('sequences the first half', () => {
    const s = sequence(motif, 2, 4 * TPQ, C_MINOR);
    expect(s.map((n) => n.pitch)).toEqual([60, 62, 63, 65]);
  });
  it('keeps contour when reducing to steps', () => {
    const c = contourOnly(mel('C4/4 G4/4 Eb4/4 C5/4'), C_MINOR);
    expect(c.map((n) => n.pitch)).toEqual([60, 62, 60, 62]);
  });
  it('applies an extracted rhythm to other pitches', () => {
    const rhythm = extractRhythm(mel('C4/2 C4/2 C4/4 C4/8'));
    const out = applyRhythm(motif, rhythm, 'replace-durations');
    expect(out.map((n) => [n.pitch, n.start, n.dur])).toEqual([
      [60, 0, T8],
      [62, T8, T8],
      [63, TPQ, TPQ],
      [67, 2 * TPQ, 2 * TPQ],
    ]);
  });
  it('quantizes and swings', () => {
    const q = quantize([{ id: 'a', pitch: 60, start: 50, dur: 200, vel: 90 }], T16, 1);
    expect(q[0].start).toBe(0);
    const sw = swing(mel('C4/2 D4/2'), 0.5, 'eighth');
    expect(sw[1].start).toBe(T8 + T8 / 2);
  });
  it('remaps between scales degree for degree', () => {
    const out = remapScale(mel('C4/4 Eb4/4 G4/4'), C_MINOR, { tonic: 0, mode: 'major' });
    expect(out.map((n) => n.pitch)).toEqual([60, 64, 67]);
  });
});

describe('analysis', () => {
  it('classifies contours and rhythms', () => {
    expect(classifyContour(mel('C4/4 E4/4 G4/4 C5/4 G4/4 E4/4 C4/4'))).toBe('arch');
    expect(classifyContour(mel('C4/4 D4/4 E4/4 F4/4 G4/4'))).toBe('ascending');
    expect(classifyRhythm(mel('C4/2 D4/2 E4/2 F4/2 G4/2 A4/2'))).toBe('eighth');
  });
  it('rates identical material as fully similar', () => {
    const a = mel('C4/4 D4/2 Eb4/2 F4/8');
    const s = similarity(a, 16 * T16, a, 16 * T16);
    expect(s.rhythm).toBe(1);
    expect(s.interval).toBe(1);
    expect(s.contour).toBeCloseTo(1);
  });
});
