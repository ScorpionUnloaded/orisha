import { describe, expect, it } from 'vitest';
import {
  adjacentChord,
  arpeggiate,
  chop,
  chordPitches,
  clearRange,
  deleteTime,
  duplicate,
  duplicateOffset,
  flipPitch,
  flipTime,
  glue,
  insertTime,
  legato,
  limitRange,
  paste,
  quantizeNotes,
  randomize,
  resizeStart,
  selectAlternate,
  setDurations,
  snapPitches,
  splitAt,
  strum,
  toClip,
  toggleMute,
  toggleSlur,
  transpose,
  velocities,
} from '../src/model/editing';
import { mel } from '../src/model/dsl';
import { pitchForLetter, pitchOfDiatonic } from '../src/model/theory';
import { pitchAtStaffPos, staffPosition, tickAtX } from '../src/notation/layout';
import { T16, T8, TPQ } from '../src/model/types';
import type { Note } from '../src/model/types';

const C_MINOR = { tonic: 0, mode: 'aeolian' as const };
const all = (notes: Note[]) => new Set(notes.map((n) => n.id));
const sig = (notes: Note[]) => [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch).map((n) => [n.pitch, n.start, n.dur]);
const chord = (pitches: number[], start: number, dur: number): Note[] => pitches.map((pitch, i) => ({ id: `c${start}-${i}`, pitch, start, dur, vel: 90 }));

describe('timing tools', () => {
  it('quantizes onsets and, optionally, ends', () => {
    const notes: Note[] = [{ id: 'a', pitch: 60, start: 130, dur: 200, vel: 90 }];
    expect(sig(quantizeNotes(notes, all(notes), T8).notes)).toEqual([[60, 240, 200]]);
    expect(sig(quantizeNotes(notes, all(notes), T8, { ends: true }).notes)).toEqual([[60, 240, 240]]);
    expect(quantizeNotes(notes, all(notes), T8, { strength: 0.5 }).notes[0].start).toBe(185);
  });
  it('makes notes legato up to the next onset', () => {
    const notes = mel('C4/1 r/3 D4/1 r/1 E4/2');
    expect(sig(legato(notes, all(notes)).notes)).toEqual([
      [60, 0, 4 * T16],
      [62, 4 * T16, 2 * T16],
      [64, 6 * T16, 2 * T16],
    ]);
  });
  it('glues repeated pitches into one note and keeps the rest', () => {
    const notes = mel('C4/2 C4/2 D4/2 D4/2');
    const r = glue(notes, all(notes));
    expect(sig(r.notes)).toEqual([
      [60, 0, TPQ],
      [62, TPQ, TPQ],
    ]);
    expect(r.sel).toEqual([notes[0].id, notes[2].id]);
  });
  it('chops on the grid and splits at a tick', () => {
    const notes = mel('C4/4');
    const c = chop(notes, all(notes), T16);
    expect(c.notes.map((n) => n.start)).toEqual([0, T16, 2 * T16, 3 * T16]);
    expect(c.sel).toHaveLength(4);
    const s = splitAt(notes, all(notes), 3 * T16);
    expect(sig(s.notes)).toEqual([
      [60, 0, 3 * T16],
      [60, 3 * T16, T16],
    ]);
    expect(splitAt(notes, all(notes), 0).notes).toHaveLength(1);
  });
  it('strums and arpeggiates chords', () => {
    const c = chord([60, 64, 67], 0, TPQ);
    const s = strum(c, all(c), 30, 'up');
    expect(sig(s.notes)).toEqual([
      [60, 0, TPQ],
      [64, 30, TPQ - 30],
      [67, 60, TPQ - 60],
    ]);
    const a = arpeggiate(c, all(c), T16, 'updown');
    expect(a.notes.map((n) => n.pitch)).toEqual([60, 64, 67, 64]);
    expect(a.notes.every((n) => n.dur === T16)).toBe(true);
    expect(a.sel).toHaveLength(4);
  });
  it('flips in time and in pitch', () => {
    const notes = mel('C4/2 D4/2 G4/4');
    expect(sig(flipTime(notes, all(notes)).notes)).toEqual([
      [67, 0, TPQ],
      [62, TPQ, T8],
      [60, TPQ + T8, T8],
    ]);
    expect(flipPitch(notes, all(notes)).notes.map((n) => n.pitch)).toEqual([67, 65, 60]);
    expect(flipPitch(notes, all(notes), C_MINOR).notes.map((n) => n.pitch)).toEqual([67, 65, 60]);
  });
  it('inserts and deletes time', () => {
    const notes = mel('C4/4 D4/4 E4/4');
    expect(insertTime(notes, TPQ, TPQ).notes.map((n) => n.start)).toEqual([0, 2 * TPQ, 3 * TPQ]);
    expect(insertTime(notes, TPQ, TPQ, 3 * TPQ).notes).toHaveLength(2);
    expect(sig(deleteTime(notes, TPQ / 2, TPQ).notes)).toEqual([
      [60, 0, TPQ / 2],
      [62, TPQ / 2, TPQ],
      [64, TPQ / 2 + TPQ, TPQ],
    ]);
  });
});

describe('pitch, velocity and marks', () => {
  it('transposes chromatically and diatonically', () => {
    const notes = mel('C4/4 Eb4/4');
    expect(transpose(notes, all(notes), 1, 'chromatic').notes.map((n) => n.pitch)).toEqual([61, 64]);
    expect(transpose(notes, all(notes), 1, 'diatonic', () => C_MINOR).notes.map((n) => n.pitch)).toEqual([62, 65]);
  });
  it('limits to a range by octaves and snaps to the scale', () => {
    const notes = mel('C3/4 C6/4 E4/4');
    expect(limitRange(notes, all(notes), 55, 72).notes.map((n) => n.pitch)).toEqual([60, 72, 64]);
    expect(snapPitches(notes, all(notes), () => C_MINOR).notes.map((n) => n.pitch)).toEqual([48, 84, 63]);
  });
  it('sets, scales and ramps velocities', () => {
    const notes = mel('C4/4 D4/4 E4/4');
    expect(velocities(notes, all(notes), { kind: 'set', value: 200 }).notes.map((n) => n.vel)).toEqual([127, 127, 127]);
    expect(velocities(notes, all(notes), { kind: 'ramp', from: 40, to: 100 }).notes.map((n) => n.vel)).toEqual([40, 70, 100]);
  });
  it('randomizes reproducibly within bounds', () => {
    const notes = mel('C4/4 D4/4 E4/4 F4/4');
    const a = randomize(notes, all(notes), { velocity: 10, timing: 20, pitch: 0 }, 7).notes;
    const b = randomize(notes, all(notes), { velocity: 10, timing: 20, pitch: 0 }, 7).notes;
    expect(a).toEqual(b);
    a.forEach((n, i) => {
      expect(Math.abs(n.vel - notes[i].vel)).toBeLessThanOrEqual(10);
      expect(Math.abs(n.start - notes[i].start)).toBeLessThanOrEqual(20);
    });
  });
  it('toggles mute and slurs', () => {
    const notes = mel('C4/4 D4/4 E4/4');
    const m = toggleMute(notes, new Set([notes[0].id])).notes;
    expect(m[0].mute).toBe(true);
    expect(toggleMute(m, new Set([notes[0].id])).notes[0].mute).toBeUndefined();
    const s = toggleSlur(notes, all(notes)).notes;
    expect(s.map((n) => n.slur)).toEqual(['start', undefined, 'end']);
    expect(toggleSlur(s, all(s)).notes.map((n) => n.slur)).toEqual([undefined, undefined, undefined]);
  });
  it('stamps chromatic and diatonic chords', () => {
    expect(chordPitches('minor', 60)).toEqual([60, 63, 67]);
    expect(chordPitches('triad', 62, C_MINOR)).toEqual([62, 65, 68]);
  });
});

describe('lengths, clipboard and navigation', () => {
  it('drags the left edge while keeping the end', () => {
    const notes = mel('r/4 C4/4');
    expect(sig(resizeStart(notes, all(notes), -T8).notes)).toEqual([[60, TPQ - T8, TPQ + T8]]);
    expect(resizeStart(notes, all(notes), 10_000).notes[0].dur).toBeGreaterThan(0);
  });
  it('sets written lengths with notation overwrite semantics', () => {
    const notes = mel('C4/2 D4/2 E4/2 F4/2');
    const r = setDurations(notes, new Set([notes[0].id]), TPQ);
    expect(sig(r.notes)).toEqual([
      [60, 0, TPQ],
      [64, TPQ, T8],
      [65, TPQ + T8, T8],
    ]);
    const shorter = setDurations(notes, new Set([notes[0].id]), T16);
    expect(shorter.notes).toHaveLength(4);
    expect(shorter.notes[0].dur).toBe(T16);
  });
  it('clears a range for note input', () => {
    const notes = mel('C4/4 D4/4 E4/4');
    expect(sig(clearRange(notes, TPQ / 2, 2 * TPQ))).toEqual([
      [60, 0, TPQ / 2],
      [64, 2 * TPQ, TPQ],
    ]);
  });
  it('copies, pastes and duplicates with fresh ids', () => {
    const notes = mel('r/4 C4/2 D4/2');
    const clip = toClip(notes, all(notes));
    expect(clip.map((n) => n.start)).toEqual([0, T8]);
    const p = paste(notes, clip, 4 * TPQ);
    expect(p.notes).toHaveLength(4);
    expect(p.sel).toHaveLength(2);
    expect(new Set(p.notes.map((n) => n.id)).size).toBe(4);
    const off = duplicateOffset(notes, TPQ);
    expect(off).toBe(TPQ);
    expect(duplicate(notes, all(notes), off).notes.map((n) => n.start).sort((a, b) => a - b)).toEqual([TPQ, TPQ + T8, 2 * TPQ, 2 * TPQ + T8]);
  });
  it('walks through chords like arrow keys in a score', () => {
    const notes = [...mel('C4/4 D4/4'), ...chord([67, 71], 2 * TPQ, TPQ)];
    expect(adjacentChord(notes, new Set(), 1).map((n) => n.pitch)).toEqual([60]);
    expect(adjacentChord(notes, new Set([notes[1].id]), 1).map((n) => n.pitch)).toEqual([67, 71]);
    expect(adjacentChord(notes, new Set([notes[1].id]), -1).map((n) => n.pitch)).toEqual([60]);
    expect(adjacentChord(notes, new Set([notes[0].id]), -1)).toEqual([]);
    expect(selectAlternate(notes, all(notes), true)).toEqual([notes[0].id, 'c960-0', 'c960-1']);
  });
});

describe('note-input helpers', () => {
  it('types letter names into the nearest octave of the key', () => {
    expect(pitchForLetter(2, -3, 60)).toBe(63); // E in C minor is E♭
    expect(pitchForLetter(6, -3, 60)).toBe(58); // B♭3 is closer to C4 than B♭4
    expect(pitchForLetter(0, 0, 60, true)).toBe(72);
    expect(pitchForLetter(4, 0, 60, true)).toBe(67);
  });
  it('maps staff positions back to pitches', () => {
    expect(pitchOfDiatonic(28, 0)).toBe(60);
    expect(pitchAtStaffPos(0, 'treble', 0)).toBe(64);
    expect(pitchAtStaffPos(1, 'treble', -3)).toBe(65);
    expect(pitchAtStaffPos(-2, 'treble', -3)).toBe(60);
    for (const p of [55, 60, 63, 67, 70, 72]) expect(pitchAtStaffPos(staffPosition(p, 'treble', -3).pos, 'treble', -3)).toBe(p);
    expect(pitchAtStaffPos(8, 'bass', 0)).toBe(57);
  });
  it('inverts a monotonic x mapping', () => {
    const map = (t: number) => 100 + t / 4;
    expect(Math.round(tickAtX(map, 0, 1920, 220))).toBe(480);
    expect(tickAtX(map, 0, 1920, 0)).toBe(0);
  });
});
