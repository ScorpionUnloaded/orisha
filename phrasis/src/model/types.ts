/**
 * PHRASIS core data model — the Musical Syntax Graph.
 *
 * Every note is owned by exactly one Drawing (dessin). Drawings are sequenced
 * inside a Period; Members (membres) are derived from contiguous drawings that
 * share a member key, and are closed by the cadence of their last drawing.
 * Each editor view (melodic staff, rhythmic staff, piano roll, …) is a
 * projection of this single structure — nothing is ever duplicated.
 */

/** Ticks per quarter note. */
export const TPQ = 480;
/** Ticks per sixteenth note. */
export const T16 = TPQ / 4;
/** Ticks per eighth note. */
export const T8 = TPQ / 2;

export type Articulation = 'accent' | 'staccato' | 'tenuto';

export interface Note {
  id: string;
  /** MIDI pitch (C4 = 60). */
  pitch: number;
  /** Onset in ticks, relative to the owning drawing (or motif) start. */
  start: number;
  /** Duration in ticks. */
  dur: number;
  /** Velocity 1–127. */
  vel: number;
  art?: Articulation;
  /** Phrasing slur boundaries. */
  slur?: 'start' | 'end';
}

export type ModeId =
  | 'major'
  | 'aeolian'
  | 'harmonic'
  | 'melodic'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian';

export interface ScaleRef {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  mode: ModeId;
}

export interface Meter {
  num: number;
  den: number;
}

/** Degrees of closure, from open breath to full stop. */
export type CadenceType = 'open' | 'quarter' | 'half' | 'strong' | 'full';

export type TransformKind =
  | 'none'
  | 'transpose'
  | 'invert'
  | 'retrograde'
  | 'retrograde-inversion'
  | 'augment'
  | 'diminish'
  | 'sequence'
  | 'rhythmic'
  | 'contour';

export interface Drawing {
  id: string;
  /** Phrase label, e.g. "A1", "A1'". */
  label: string;
  /** Member key this drawing belongs to, e.g. "A", "A'", "B". */
  member: string;
  /** Length in bars. */
  bars: number;
  notes: Note[];
  /** Rest point that closes this drawing. */
  cadence: CadenceType;
  scale: ScaleRef;
  motifRef?: string;
  transform: TransformKind;
}

export interface KeyRegion {
  id: string;
  /** Start bar (0-based, may be fractional). */
  start: number;
  /** End bar (exclusive). */
  end: number;
  scale: ScaleRef;
  /** A pivot/transition region drawn as a wedge between two keys. */
  pivot?: boolean;
}

export type Lane = 'hihat' | 'snare' | 'kick' | 'other';
export const LANES: Lane[] = ['hihat', 'snare', 'kick', 'other'];

/** Step value: 0 off, 1 ghost, 2 on, 3 accent. */
export type StepValue = 0 | 1 | 2 | 3;

export interface StepPattern {
  /** Steps per bar (8 = eighth-note grid). */
  perBar: number;
  lanes: Record<Lane, StepValue[]>;
}

export interface RhythmSettings {
  source: 'melody' | 'pattern';
  quantizeInput: 'auto' | '8' | '16';
  sensitivity: number;
  target: 'selected' | 'drawing' | 'member' | 'period';
  mode: 'replace-durations' | 'replace-onsets' | 'accents-only';
  strength: number;
  grid: '4' | '8' | '16' | '32';
  quantizeStrength: number;
  swing: number;
  swingFeel: 'eighth' | 'sixteenth';
  grouping: 'auto' | '4+4' | '3+3+2' | '2+2+2+2' | '3+2+3';
  subdivision: '8' | '16';
  accent: 'downbeat' | 'backbeat' | 'offbeat';
}

export interface PeriodRules {
  enforceCadences: boolean;
  showPhraseLabels: boolean;
  highlightSymmetry: boolean;
  symmetryType: 'balanced' | 'asymmetric' | 'mirror';
  relSimilarity: boolean;
  relTransformation: boolean;
  relContrast: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** Short descriptor shown under the name, e.g. "Melodic study". */
  subtitle: string;
  kind: string;
  createdAt: string;
  modifiedAt: string;
  keywords: string[];
  memo: string;
  key: ScaleRef;
  meter: Meter;
  tempo: number;
  periodName: string;
  form: string;
  drawings: Drawing[];
  regions: KeyRegion[];
  /** Library motifs referenced by this project. */
  motifs: string[];
  /** Optional lower voice (absolute ticks), shown as ghost notes and on a bass staff. */
  lowerVoice?: Note[];
  /** Percussive clef for rhythm-only studies. */
  percussive?: boolean;
  steps: StepPattern;
  rhythm: RhythmSettings;
  rules: PeriodRules;
}

export type MotifCategory = 'user' | 'core' | 'rhythmic';

export interface Motif {
  id: string;
  symbol: string;
  name: string;
  category: MotifCategory;
  /** Smart groups the motif is filed under. */
  groups: Array<'intervals' | 'contour'>;
  collections: string[];
  tags: string[];
  description: string;
  mood: string;
  favourite: boolean;
  bars: number;
  notes: Note[];
  scale: ScaleRef;
}

export interface Collection {
  id: string;
  name: string;
}
