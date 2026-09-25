import type { ModeId, ScaleRef } from './types';

export interface ModeInfo {
  steps: number[];
  /** Display name used in "C natural minor". */
  scaleName: string;
  /** Display name used in key selectors, "C minor". */
  keyName: string;
  /** Semitones from this mode's tonic down to its relative major tonic. */
  majorOffset: number;
}

export const MODES: Record<ModeId, ModeInfo> = {
  major: { steps: [0, 2, 4, 5, 7, 9, 11], scaleName: 'major', keyName: 'major', majorOffset: 0 },
  aeolian: { steps: [0, 2, 3, 5, 7, 8, 10], scaleName: 'natural minor', keyName: 'minor', majorOffset: 9 },
  harmonic: { steps: [0, 2, 3, 5, 7, 8, 11], scaleName: 'harmonic minor', keyName: 'harmonic minor', majorOffset: 9 },
  melodic: { steps: [0, 2, 3, 5, 7, 9, 11], scaleName: 'melodic minor', keyName: 'melodic minor', majorOffset: 9 },
  dorian: { steps: [0, 2, 3, 5, 7, 9, 10], scaleName: 'Dorian', keyName: 'Dorian', majorOffset: 2 },
  phrygian: { steps: [0, 1, 3, 5, 7, 8, 10], scaleName: 'Phrygian', keyName: 'Phrygian', majorOffset: 4 },
  lydian: { steps: [0, 2, 4, 6, 7, 9, 11], scaleName: 'Lydian', keyName: 'Lydian', majorOffset: 5 },
  mixolydian: { steps: [0, 2, 4, 5, 7, 9, 10], scaleName: 'Mixolydian', keyName: 'Mixolydian', majorOffset: 7 },
  locrian: { steps: [0, 1, 3, 5, 6, 8, 10], scaleName: 'Locrian', keyName: 'Locrian', majorOffset: 11 },
};

export const MODE_ORDER: ModeId[] = [
  'aeolian',
  'harmonic',
  'melodic',
  'major',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
];

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Pitch class of each natural letter. */
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Circle-of-fifths position of a major key by its tonic pitch class. */
const MAJOR_FIFTHS: Record<number, number> = {
  0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1,
};

/** Number of sharps (>0) or flats (<0) in the key signature of a scale. */
export function keyFifths(scale: ScaleRef): number {
  const majorTonic = mod(scale.tonic - MODES[scale.mode].majorOffset, 12);
  return MAJOR_FIFTHS[majorTonic];
}

export interface Spelled {
  /** Letter index 0–6 (C–B). */
  letter: number;
  /** Alteration in semitones (-2..2). */
  alter: number;
  octave: number;
}

/** Diatonic spelling of the seven letters for a key signature. */
export function keySignatureAlters(fifths: number): number[] {
  const alters = [0, 0, 0, 0, 0, 0, 0];
  const sharpOrder = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
  const flatOrder = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F
  if (fifths > 0) for (let i = 0; i < fifths; i++) alters[sharpOrder[i]] = 1;
  if (fifths < 0) for (let i = 0; i < -fifths; i++) alters[flatOrder[i]] = -1;
  return alters;
}

/**
 * Spell a MIDI pitch in the context of a key. Diatonic notes take the key's
 * spelling; chromatic notes are spelled as the neighbour alteration with the
 * smallest accidental, preferring a raised lower neighbour (leading tones).
 */
export function spellPitch(pitch: number, fifths: number): Spelled {
  const alters = keySignatureAlters(fifths);
  const pc = mod(pitch, 12);
  const candidates: Array<Spelled & { delta: number }> = [];
  for (let l = 0; l < 7; l++) {
    const diatonicPc = mod(LETTER_PC[l] + alters[l], 12);
    for (const delta of [0, 1, -1]) {
      if (mod(diatonicPc + delta, 12) !== pc) continue;
      const alter = alters[l] + delta;
      if (Math.abs(alter) > 2) continue;
      const octave = (pitch - LETTER_PC[l] - alter) / 12 - 1;
      candidates.push({ letter: l, alter, octave, delta });
    }
  }
  candidates.sort((a, b) => {
    if (a.delta === 0 || b.delta === 0) return Math.abs(a.delta) - Math.abs(b.delta);
    if (Math.abs(a.alter) !== Math.abs(b.alter)) return Math.abs(a.alter) - Math.abs(b.alter);
    return b.delta - a.delta; // prefer raising (leading tones)
  });
  const best = candidates[0];
  return { letter: best.letter, alter: best.alter, octave: best.octave };
}

/** Absolute diatonic index (C0 = 0, D0 = 1, …; C4 = 28). */
export function diatonicIndex(s: Spelled): number {
  return s.octave * 7 + s.letter;
}

export function accidentalText(alter: number): string {
  return ['𝄫', '♭', '', '♯', '𝄪'][alter + 2];
}

export function pitchName(pitch: number, fifths = 0, withOctave = true): string {
  const s = spellPitch(pitch, fifths);
  const acc = s.alter === -1 ? 'b' : s.alter === 1 ? '#' : s.alter === -2 ? 'bb' : s.alter === 2 ? '##' : '';
  return LETTERS[s.letter] + acc + (withOctave ? String(s.octave) : '');
}

/** Human-friendly pitch name using ♭/♯. */
export function prettyPitch(pitch: number, fifths = 0, withOctave = true): string {
  const s = spellPitch(pitch, fifths);
  return LETTERS[s.letter] + accidentalText(s.alter) + (withOctave ? String(s.octave) : '');
}

export function parsePitch(name: string): number {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2}|n)?(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Bad pitch "${name}"`);
  const letter = LETTERS.indexOf(m[1].toUpperCase());
  const acc = m[2] ?? '';
  const alter = acc === 'n' ? 0 : acc.startsWith('#') ? acc.length : -acc.length;
  const octave = Number(m[3]);
  return (octave + 1) * 12 + LETTER_PC[letter] + alter;
}

/** Tonic spelled within its own key. */
export function tonicName(scale: ScaleRef): string {
  return pitchName(60 + scale.tonic, keyFifths(scale), false).replace('b', '♭').replace('#', '♯');
}

export function tonicNameAscii(scale: ScaleRef): string {
  return pitchName(60 + scale.tonic, keyFifths(scale), false);
}

/** "C minor" */
export function keyLabel(scale: ScaleRef): string {
  return `${tonicNameAscii(scale)} ${MODES[scale.mode].keyName}`;
}

/** "C natural minor" */
export function scaleLabel(scale: ScaleRef): string {
  return `${tonicNameAscii(scale)} ${MODES[scale.mode].scaleName}`;
}

/** Compact region label: "Cm", "Eb", "D dor". */
export function shortKeyLabel(scale: ScaleRef): string {
  const t = tonicNameAscii(scale);
  switch (scale.mode) {
    case 'major':
      return t;
    case 'aeolian':
    case 'harmonic':
    case 'melodic':
      return `${t}m`;
    default:
      return `${t} ${MODES[scale.mode].scaleName.slice(0, 3).toLowerCase()}`;
  }
}

export interface Degree {
  /** Absolute scale-degree index: octave * 7 + degree. */
  d: number;
  /** Chromatic offset from the scale degree (usually 0, +1 for raised notes). */
  c: number;
}

export function toDegree(pitch: number, scale: ScaleRef): Degree {
  const steps = MODES[scale.mode].steps;
  const rel = pitch - scale.tonic;
  const oct = Math.floor(rel / 12);
  const pc = mod(rel, 12);
  let idx = 0;
  for (let i = 0; i < 7; i++) if (steps[i] <= pc) idx = i;
  return { d: oct * 7 + idx, c: pc - steps[idx] };
}

export function fromDegree(deg: Degree, scale: ScaleRef): number {
  const steps = MODES[scale.mode].steps;
  const oct = Math.floor(deg.d / 7);
  const idx = mod(deg.d, 7);
  return scale.tonic + oct * 12 + steps[idx] + deg.c;
}

export function inScale(pitch: number, scale: ScaleRef): boolean {
  return MODES[scale.mode].steps.includes(mod(pitch - scale.tonic, 12));
}

/** Nearest in-scale pitch (ties resolve downward). */
export function snapToScale(pitch: number, scale: ScaleRef): number {
  if (inScale(pitch, scale)) return pitch;
  if (inScale(pitch - 1, scale)) return pitch - 1;
  return pitch + 1;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Scale degree of a pitch as a roman numeral, with ♯/♭ for chromatic notes. */
export function romanDegree(pitch: number, scale: ScaleRef): string {
  const deg = toDegree(pitch, scale);
  const base = ROMAN[mod(deg.d, 7)];
  return deg.c > 0 ? `♯${base}` : deg.c < 0 ? `♭${base}` : base;
}

export const isBlackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(mod(pitch, 12));

/** All 24 major/minor keys for the key selector, ordered by tonic. */
export function keyOptions(): ScaleRef[] {
  const out: ScaleRef[] = [];
  for (let t = 0; t < 12; t++) {
    out.push({ tonic: t, mode: 'major' });
    out.push({ tonic: t, mode: 'aeolian' });
  }
  return out;
}

export function sameScale(a: ScaleRef, b: ScaleRef): boolean {
  return a.tonic === b.tonic && a.mode === b.mode;
}
