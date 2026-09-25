import { describe, expect, it } from 'vitest';
import { demoProject, motifLibrary, projectFromTemplate, TEMPLATES } from '../src/model/demo';
import { mel } from '../src/model/dsl';
import { projectToMidi } from '../src/model/midi';
import { rerhythm, rhythmTemplate } from '../src/model/rhythmTemplates';
import { totalBars } from '../src/model/syntax';
import { classifyContour, classifySymmetry, classifyRhythm, outline } from '../src/model/analysis';
import { generateVariations, variation, VARIATIONS } from '../src/model/variations';
import { melodyToSteps, stepsToRhythm } from '../src/model/transforms';
import { barwiseMapping, buildBars } from '../src/notation/layout';
import { TPQ } from '../src/model/types';

const C_MINOR = { tonic: 0, mode: 'aeolian' as const };
const BAR = 4 * TPQ;

describe('variations', () => {
  const alpha = motifLibrary()[0];
  const len = alpha.bars * BAR;
  it('produces every named variation', () => {
    for (const v of VARIATIONS) {
      const r = variation(v.id, alpha.notes, len, alpha.scale);
      expect(r.notes.length, v.id).toBeGreaterThan(0);
      for (const n of r.notes) expect(n.start + n.dur, v.id).toBeLessThanOrEqual(r.length + 1);
    }
    expect(variation('augment', alpha.notes, len, alpha.scale).length).toBe(len * 2);
  });
  it('generates distinct proposals that keep the rhythm and cadence when asked', () => {
    const opts = { preserveCadence: true, preserveLength: true, preserveRhythm: true, preserveScale: true, varyContour: true, varyIntervals: true, distance: 0.4 };
    const out = generateVariations(alpha.notes, len, C_MINOR, opts, 8);
    expect(out).toHaveLength(8);
    const src = alpha.notes.map((n) => `${n.start}:${n.dur}`).join(',');
    const last = alpha.notes[alpha.notes.length - 1];
    for (const p of out) {
      expect(p.notes.map((n) => `${n.start}:${n.dur}`).join(',')).toBe(src);
      expect(p.notes[p.notes.length - 1].pitch).toBe(last.pitch);
      expect(p.recipe.length).toBeGreaterThan(0);
    }
    expect(new Set(out.map((p) => p.notes.map((n) => n.pitch).join(','))).size).toBe(8);
  });
});

describe('rhythm', () => {
  it('fills a span with a rhythm template', () => {
    for (const kind of ['eighth', 'quarter', 'dotted', 'mixed'] as const) {
      const r = rhythmTemplate(kind, 2 * BAR);
      expect(r[0].start).toBe(0);
      const last = r[r.length - 1];
      expect(last.start + last.dur).toBe(2 * BAR);
    }
    const notes = rerhythm(mel('C4/4 D4/4 Eb4/4 F4/4 G4/16'), rhythmTemplate('eighth', 2 * BAR));
    expect(classifyRhythm(notes)).toBe('eighth');
  });
  it('round-trips a melody through the step pattern', () => {
    const melody = mel('C4/4 D4/2 Eb4/2 F4/8');
    const steps = melodyToSteps(melody, 1, { num: 4, den: 4 });
    const onsets = stepsToRhythm(steps, { num: 4, den: 4 }).map((r) => r.start);
    expect(onsets).toEqual(melody.map((n) => n.start));
  });
});

describe('demo analysis matches the inspector', () => {
  const p = demoProject();
  const a2 = p.drawings[1];
  it('reads Drawing A2 as an eighth-based, near-symmetric arch', () => {
    expect(classifyContour(a2.notes)).toBe('arch');
    expect(classifySymmetry(a2.notes, a2.bars * BAR)).toBe('near-symmetric');
    expect(classifyRhythm(a2.notes)).toBe('eighth');
  });
  it('reduces the period to a structural outline', () => {
    const notes = p.drawings.flatMap((d, i) => d.notes.map((n) => ({ ...n, start: n.start + p.drawings.slice(0, i).reduce((s, x) => s + x.bars, 0) * BAR })));
    expect(outline(notes, BAR / 2, p.meter)).toHaveLength(totalBars(p) * 2);
  });
});

describe('templates and export', () => {
  it('builds every template', () => {
    for (const t of TEMPLATES) {
      const p = projectFromTemplate(t.id, { name: t.name, key: C_MINOR, meter: { num: 4, den: 4 }, tempo: 100 });
      expect(p.drawings.length).toBeGreaterThan(0);
      expect(p.steps.lanes.kick.length).toBe(totalBars(p) * 8);
    }
  });
  it('writes a valid MIDI header and track', () => {
    const bytes = projectToMidi(demoProject());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(String.fromCharCode(...bytes.slice(14, 18))).toBe('MTrk');
    const trackLen = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
    expect(trackLen).toBe(bytes.length - 22);
    expect(Array.from(bytes.slice(-3))).toEqual([0xff, 0x2f, 0x00]);
  });
});

describe('bar-aligned spacing', () => {
  it('keeps barlines on the shared axis', () => {
    const notes = mel('C4/2 D4/2 E4/2 F4/2 G4/8 | A4/16');
    const bars = buildBars(notes, { clef: 'treble', fifths: 0, meter: { num: 4, den: 4 }, from: 0, to: 2 * BAR });
    const axis = (t: number) => 100 + (t / BAR) * 80;
    const map = barwiseMapping(bars, axis, 6);
    expect(map(2 * BAR)).toBe(axis(2 * BAR));
    const xs = notes.map((n) => map(n.start));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(map(BAR)).toBeGreaterThan(axis(BAR));
    expect(map(BAR)).toBeLessThan(axis(BAR) + 6);
  });
});

