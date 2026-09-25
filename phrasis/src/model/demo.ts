/** Built-in content: the demo period, the motif library and the recent projects. */
import { mel, shift } from './dsl';
import { melodyToSteps } from './transforms';
import { barTicks, uid } from './syntax';
import type {
  CadenceType,
  Collection,
  Drawing,
  KeyRegion,
  Meter,
  Motif,
  MotifCategory,
  Note,
  PeriodRules,
  Project,
  RhythmSettings,
  ScaleRef,
  TransformKind,
} from './types';

export const C_MINOR: ScaleRef = { tonic: 0, mode: 'aeolian' };
const G_MINOR: ScaleRef = { tonic: 7, mode: 'aeolian' };
const EB_MAJOR: ScaleRef = { tonic: 3, mode: 'major' };

export const DEFAULT_RHYTHM: RhythmSettings = {
  source: 'melody',
  quantizeInput: 'auto',
  sensitivity: 0.75,
  target: 'selected',
  mode: 'replace-durations',
  strength: 1,
  grid: '16',
  quantizeStrength: 0.8,
  swing: 0.18,
  swingFeel: 'eighth',
  grouping: 'auto',
  subdivision: '16',
  accent: 'downbeat',
};

export const DEFAULT_RULES: PeriodRules = {
  enforceCadences: true,
  showPhraseLabels: true,
  highlightSymmetry: true,
  symmetryType: 'balanced',
  relSimilarity: true,
  relTransformation: true,
  relContrast: false,
};

interface DrawingSpec {
  label: string;
  member: string;
  bars: number;
  src: string;
  cadence?: CadenceType;
  scale?: ScaleRef;
  motif?: string;
  transform?: TransformKind;
}

function drawing(spec: DrawingSpec, fallback: ScaleRef): Drawing {
  return {
    id: uid('d'),
    label: spec.label,
    member: spec.member,
    bars: spec.bars,
    notes: mel(spec.src),
    cadence: spec.cadence ?? 'open',
    scale: spec.scale ?? fallback,
    motifRef: spec.motif,
    transform: spec.transform ?? 'none',
  };
}

interface ProjectSpec {
  name: string;
  subtitle: string;
  kind?: string;
  key: ScaleRef;
  meter?: Meter;
  tempo?: number;
  form?: string;
  drawings: DrawingSpec[];
  regions?: Array<Omit<KeyRegion, 'id'>>;
  motifs?: string[];
  lowerVoice?: Note[];
  percussive?: boolean;
  createdAt: string;
  modifiedAt: string;
  keywords?: string[];
  memo?: string;
}

export function buildProject(spec: ProjectSpec): Project {
  const meter = spec.meter ?? { num: 4, den: 4 };
  const drawings = spec.drawings.map((d) => drawing(d, spec.key));
  const bars = drawings.reduce((s, d) => s + d.bars, 0);
  const project: Project = {
    id: uid('p'),
    name: spec.name,
    subtitle: spec.subtitle,
    kind: spec.kind ?? 'Composition',
    createdAt: spec.createdAt,
    modifiedAt: spec.modifiedAt,
    keywords: spec.keywords ?? [],
    memo: spec.memo ?? '',
    key: spec.key,
    meter,
    tempo: spec.tempo ?? 112,
    periodName: 'Period 01',
    form: spec.form ?? 'Period (AA\'BB)',
    drawings,
    regions: (spec.regions ?? [{ start: 0, end: bars, scale: spec.key }]).map((r) => ({ ...r, id: uid('r') })),
    motifs: spec.motifs ?? [],
    lowerVoice: spec.lowerVoice,
    percussive: spec.percussive,
    steps: { perBar: 8, lanes: { hihat: [], snare: [], kick: [], other: [] } },
    rhythm: { ...DEFAULT_RHYTHM },
    rules: { ...DEFAULT_RULES },
  };
  project.steps = stepsFor(project);
  return project;
}

/** Step pattern derived from the whole melody. */
export function stepsFor(project: Project) {
  const bt = barTicks(project.meter);
  const notes: Note[] = [];
  let bar = 0;
  for (const d of project.drawings) {
    for (const n of d.notes) notes.push({ ...n, start: n.start + bar * bt });
    bar += d.bars;
  }
  return melodyToSteps(notes, bar, project.meter, 8, project.rhythm?.sensitivity ?? 0.75);
}

// ---------------------------------------------------------------------------
// Melodic material

export const MOTIF_ALPHA = 'C4/4 D4/4 Eb4/2 F4/2 G4/4 | Ab4/2( G4/2 Ab4/2 Bb4/2 C5/8>) | D5/4> C5/2 Bb4/2 Ab4/4 G4/4 | F4/2 Eb4/2 D4/4 Eb4/8';
const A2 = 'G4/2 Ab4/2 Bb4/2 C5/2 D5/4> C5/2 D5/2 | Eb5/4> D5/2 C5/2 Bb4/2 A4/2. Bb4/2. G4/2 | C5/2( Bb4/2 A4/2 G4/2) A4/4 F#4/4 | G4/12 r/4';
const A1_PRIME = 'G4/4 A4/4 Bb4/2 C5/2 D5/4 | Eb5/2( D5/2 C5/2 Bb4/2) A4/8';
export const MOTIF_BETA = 'Bb4/4 G4/2 Ab4/2 Bb4/4 Eb5/4> | D5/2 C5/2 Bb4/2 Ab4/2 Bb4/8';
export const MOTIF_GAMMA = 'C5/6> Bb4/2 Ab4/4 G4/4 | F4/2( Eb4/2 D4/4) G4/8';
const B2 = 'Ab4/4 F4/4 Eb4/4 D4/2 B3/2 | C4/12 r/4';

function todayAt(h: number, m: number, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function demoProject(): Project {
  return buildProject({
    name: 'Wandering Line',
    subtitle: 'Melodic study',
    key: C_MINOR,
    createdAt: new Date(2025, 2, 12, 9, 1).toISOString(),
    modifiedAt: todayAt(9, 42),
    keywords: ['melody', 'study', 'minor'],
    memo: 'Exploring stepwise motion and neighbor tones. First ideas for the main theme. Consider variation with a rising sequence.',
    motifs: ['alpha', 'beta', 'gamma'],
    drawings: [
      { label: 'A1', member: 'A', bars: 4, src: MOTIF_ALPHA, motif: 'alpha' },
      { label: 'A2', member: 'A', bars: 4, src: A2, cadence: 'quarter', motif: 'alpha' },
      { label: "A1'", member: "A'", bars: 2, src: A1_PRIME, scale: G_MINOR, motif: 'alpha', transform: 'transpose' },
      { label: 'A3', member: "A'", bars: 2, src: MOTIF_BETA, cadence: 'half', scale: EB_MAJOR, motif: 'beta' },
      { label: 'B1', member: 'B', bars: 2, src: MOTIF_GAMMA, motif: 'gamma' },
      { label: 'B2', member: 'B', bars: 2, src: B2, cadence: 'full', motif: 'gamma', transform: 'sequence' },
    ],
    regions: [
      { start: 0, end: 5, scale: C_MINOR },
      { start: 5, end: 6, scale: G_MINOR, pivot: true },
      { start: 6, end: 10, scale: G_MINOR },
      { start: 10, end: 13, scale: EB_MAJOR },
      { start: 13, end: 16, scale: C_MINOR },
    ],
  });
}

function repeatBars(src: string, times: number): string {
  return Array.from({ length: times }, () => src).join(' | ');
}

export function recentProjects(): Project[] {
  const cMajor: ScaleRef = { tonic: 0, mode: 'major' };
  const dDorian: ScaleRef = { tonic: 2, mode: 'dorian' };
  const fMajor: ScaleRef = { tonic: 5, mode: 'major' };
  const gMajor: ScaleRef = { tonic: 7, mode: 'major' };
  const date = (y: number, mo: number, d: number, h = 10, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

  const counterUpper = 'C5/8 B4/4 A4/4 | G4/12 A4/2 B4/2 | C5/4 E5/4 D5/4 C5/4 | B4/12 r/4';
  const counterLower = mel(
    'C3/4 D3/4 E3/4 F3/4 | G3/4 F3/4 E3/4 D3/4 | E3/8 F3/4 A3/4 | G3/12 r/4 | ' +
      'C3/4 D3/4 E3/4 F3/4 | G3/4 F3/4 E3/4 D3/4 | E3/8 F3/4 A3/4 | G3/12 r/4 | ' +
      'A2/4 B2/4 C3/4 D3/4 | E3/8 D3/8 | F3/4 G3/4 G2/8 | C3/12 r/4',
    70,
  );
  const fugueSubject = 'G4/6 Eb4/2 C4/4 G4/4 | Ab4/2 G4/2 F4/2 Eb4/2 D4/4 G4/4 | C5/4 Bb4/2 Ab4/2 G4/2 F4/2 Eb4/4 | D4/8 r/8';
  const fugueLower = shift(
    mel('G3/6 Eb3/2 C3/4 G3/4 | Ab3/2 G3/2 F3/2 Eb3/2 D3/4 G3/4 | C4/4 Bb3/2 Ab3/2 G3/2 F3/2 Eb3/4 | D3/8 r/8 | ' +
      repeatBars('C3/4 G2/4 Ab2/4 F2/4', 4) + ' | ' + repeatBars('Eb3/8 D3/8', 4), 68),
    barTicks({ num: 4, den: 4 }) * 4,
  );

  return [
    demoProject(),
    buildProject({
      name: 'Intervals I',
      subtitle: 'Scale and interval',
      kind: 'Study',
      key: C_MINOR,
      createdAt: date(2025, 3, 11, 16, 20),
      modifiedAt: todayAt(8, 17),
      keywords: ['intervals', 'scale'],
      memo: 'Thirds and fourths above each scale degree. Check the tritone between D and Ab.',
      motifs: ['delta', 'eta'],
      form: 'Sentence (aa\'b)',
      drawings: [
        { label: 'A1', member: 'A', bars: 2, src: 'C4/2 Eb4/2 D4/2 F4/2 Eb4/2 G4/2 F4/2 Ab4/2 | G4/2 Bb4/2 Ab4/2 C5/2 Bb4/4 r/4', motif: 'delta' },
        { label: 'A2', member: 'A', bars: 2, src: 'C5/4 Ab4/2 Bb4/2 G4/4 Ab4/2 F4/2 | G4/8 r/8', cadence: 'quarter', motif: 'delta' },
        { label: 'B1', member: 'B', bars: 2, src: 'C4/4 F4/4 Bb4/4 Eb5/4 | D5/4 G4/4 C5/8', motif: 'eta' },
        { label: 'B2', member: 'B', bars: 2, src: 'Ab4/4 F4/4 D4/4 B3/4 | C4/12 r/4', cadence: 'full' },
      ],
    }),
    buildProject({
      name: 'Counter-Motion',
      subtitle: 'Two voices',
      kind: 'Composition',
      key: cMajor,
      tempo: 96,
      createdAt: date(2025, 3, 7, 11, 5),
      modifiedAt: todayAt(18, 3, -1),
      keywords: ['counterpoint', 'contrary motion'],
      memo: 'Upper voice descends while the bass climbs. Keep perfect intervals on strong beats.',
      form: 'Period (AB)',
      lowerVoice: counterLower,
      drawings: [
        { label: 'A1', member: 'A', bars: 4, src: counterUpper },
        { label: 'A2', member: 'A', bars: 4, src: 'E5/8 D5/4 C5/4 | B4/12 C5/2 D5/2 | E5/4 G5/4 F5/4 E5/4 | D5/12 r/4', cadence: 'half' },
        { label: 'B1', member: 'B', bars: 4, src: 'C5/4 B4/4 A4/4 G4/4 | G4/8 A4/8 | A4/4 G4/4 F4/4 D4/4 | C4/12 r/4', cadence: 'full' },
      ],
    }),
    buildProject({
      name: 'Study 03',
      subtitle: 'Rhythmic variation',
      kind: 'Study',
      key: C_MINOR,
      percussive: true,
      createdAt: date(2025, 3, 10, 9, 0),
      modifiedAt: date(2025, 3, 10, 15, 30),
      keywords: ['rhythm', 'accents'],
      memo: 'Accent displacement over a steady quarter pulse.',
      motifs: ['phi', 'chi'],
      form: 'Phrase (aa\')',
      drawings: [
        { label: 'A1', member: 'A', bars: 2, src: 'C5/4> C5/4 C5/2 C5/2 C5/4 | C5/4> C5/4 C5/2 C5/2 C5/2 C5/2', motif: 'phi' },
        { label: 'A2', member: 'A', bars: 2, src: 'C5/4> C5/4 C5/2 C5/2 C5/4 | C5/2 C5/2 C5/4> C5/4 r/4', cadence: 'full', motif: 'chi' },
      ],
    }),
    buildProject({
      name: 'Fugue Sketch',
      subtitle: 'Subject and response',
      kind: 'Composition',
      key: C_MINOR,
      tempo: 84,
      createdAt: date(2025, 3, 1, 10, 0),
      modifiedAt: date(2025, 3, 9, 17, 12),
      keywords: ['fugue', 'imitation'],
      memo: 'Tonal answer enters in bar 5 in the bass. Episode material from the tail of the subject.',
      form: 'Exposition',
      lowerVoice: fugueLower,
      drawings: [
        { label: 'S', member: 'Subject', bars: 4, src: fugueSubject, cadence: 'quarter' },
        { label: 'CS', member: 'Answer', bars: 4, src: 'C5/4 D5/4 Eb5/4 C5/4 | B4/4 C5/4 D5/8 | Eb5/4 D5/4 C5/4 Bb4/4 | Ab4/8 G4/8', cadence: 'half' },
        { label: 'E1', member: 'Episode', bars: 4, src: 'Ab4/2 G4/2 F4/2 Eb4/2 F4/8 | G4/2 F4/2 Eb4/2 D4/2 Eb4/8 | F4/2 Eb4/2 D4/2 C4/2 D4/8 | G4/16' },
        { label: 'E2', member: 'Episode', bars: 4, src: 'C5/6 Bb4/2 Ab4/4 G4/4 | F4/4 Eb4/4 D4/8 | Eb4/4 D4/4 C4/4 B3/4 | C4/12 r/4', cadence: 'full' },
      ],
    }),
    buildProject({
      name: 'Modal Experiment',
      subtitle: 'D Dorian',
      kind: 'Study',
      key: dDorian,
      tempo: 100,
      createdAt: date(2025, 3, 2, 14, 0),
      modifiedAt: date(2025, 3, 8, 11, 45),
      keywords: ['modal', 'dorian'],
      memo: 'Bring out the raised sixth (B natural) against the minor third.',
      motifs: ['upsilon'],
      form: 'Period (AB)',
      drawings: [
        { label: 'A1', member: 'A', bars: 4, src: 'D4/4 F4/2 G4/2 A4/4 B4/2 A4/2 | G4/4 F4/4 E4/8 | D4/4 E4/2 F4/2 G4/4 A4/4 | B4/2 A4/2 G4/4 E4/8', motif: 'upsilon' },
        { label: 'B1', member: 'B', bars: 4, src: 'C5/4 B4/4 A4/4 G4/4 | F4/2 G4/2 A4/4 D4/8 | E4/4 F4/4 G4/4 E4/4 | D4/12 r/4', cadence: 'full' },
      ],
    }),
    buildProject({
      name: 'Rhythmic Cells',
      subtitle: 'Motivic development',
      kind: 'Study',
      key: C_MINOR,
      percussive: true,
      createdAt: date(2025, 2, 26, 10, 0),
      modifiedAt: date(2025, 3, 6, 16, 20),
      keywords: ['rhythm', 'cells'],
      memo: 'Three cells: gallop, dotted, syncopation. Combine in 3+3+2.',
      motifs: ['psi', 'omega'],
      form: 'Phrase',
      drawings: [
        { label: 'C1', member: 'Cells', bars: 2, src: 'C5/2> C5/1 C5/1 C5/2 C5/1 C5/1 C5/4 C5/4 | C5/3> C5/1 C5/3 C5/1 C5/8', motif: 'psi' },
        { label: 'C2', member: 'Cells', bars: 2, src: 'C5/2 C5/4> C5/2 C5/4 C5/4 | C5/6> C5/6 C5/4', motif: 'omega' },
        { label: 'C3', member: 'Cells', bars: 2, src: 'C5/2> C5/1 C5/1 C5/3 C5/1 C5/2 C5/4> C5/2 | C5/12 r/4', cadence: 'full' },
      ],
    }),
    buildProject({
      name: 'Canon Idea',
      subtitle: 'Round / Imitation',
      kind: 'Composition',
      key: C_MINOR,
      createdAt: date(2025, 2, 20, 10, 0),
      modifiedAt: date(2025, 3, 4, 12, 10),
      keywords: ['canon', 'round'],
      memo: 'Second voice enters after two bars at the octave below.',
      form: 'Round',
      lowerVoice: shift(mel('C3/2 Eb3/1 F3/1 G3/2 Ab3/2 G3/2 F3/2 Eb3/4 | D3/2 Eb3/2 F3/2 D3/2 G2/8 | C3/2 Eb3/1 F3/1 G3/2 Ab3/2 G3/2 F3/2 Eb3/4 | D3/2 Eb3/2 F3/2 D3/2 C3/8 | C3/16 | C3/16', 66), barTicks({ num: 4, den: 4 }) * 2),
      drawings: [
        { label: 'A1', member: 'A', bars: 4, src: 'C4/2 Eb4/1 F4/1 G4/2 Ab4/2 G4/2 F4/2 Eb4/4 | D4/2 Eb4/2 F4/2 D4/2 G3/8 | C4/2 Eb4/1 F4/1 G4/2 Ab4/2 G4/2 F4/2 Eb4/4 | D4/2 Eb4/2 F4/2 D4/2 C4/8', cadence: 'half' },
        { label: 'A2', member: 'A', bars: 4, src: 'G4/4 Ab4/4 Bb4/4 C5/4 | Bb4/2 Ab4/2 G4/4 F4/8 | Eb4/4 F4/4 G4/4 Ab4/4 | G4/12 r/4', cadence: 'full' },
      ],
    }),
    buildProject({
      name: 'Pastoral Draft',
      subtitle: 'Siciliano in 6/8',
      kind: 'Composition',
      key: fMajor,
      meter: { num: 6, den: 8 },
      tempo: 72,
      createdAt: date(2025, 2, 18, 9, 30),
      modifiedAt: date(2025, 3, 2, 10, 5),
      keywords: ['pastoral', 'compound meter'],
      memo: 'Lilting dotted figures; drone on F in the lower voice.',
      form: 'Period (AA\')',
      drawings: [
        { label: 'A1', member: 'A', bars: 4, src: 'A4/3 Bb4/1 A4/2 G4/4 F4/2 | C5/6 A4/6 | Bb4/3 C5/1 Bb4/2 A4/4 G4/2 | A4/12', cadence: 'half' },
        { label: "A1'", member: "A'", bars: 4, src: 'A4/3 Bb4/1 A4/2 G4/4 F4/2 | D5/6 Bb4/6 | A4/3 G4/1 F4/2 G4/4 E4/2 | F4/12', cadence: 'full' },
      ],
    }),
    buildProject({
      name: 'Etude 01',
      subtitle: 'Arpeggio technique',
      kind: 'Study',
      key: gMajor,
      tempo: 120,
      createdAt: date(2025, 2, 12, 9, 30),
      modifiedAt: date(2025, 2, 27, 18, 40),
      keywords: ['arpeggio', 'technique'],
      memo: 'Broken chords in sixteenths; keep the top line singing.',
      form: 'Phrase',
      drawings: [
        { label: 'A1', member: 'A', bars: 4, src: repeatBars('G4/1 B4/1 D5/1 G5/1 D5/1 B4/1 G4/1 B4/1 C5/1 E5/1 G5/1 E5/1 C5/1 A4/1 F#4/1 A4/1', 2) + ' | D5/1 F#5/1 A5/1 F#5/1 D5/1 A4/1 F#4/1 D4/1 G4/8 | G4/12 r/4', cadence: 'full' },
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Motif library

export const COLLECTIONS: Collection[] = [
  { id: 'a1', name: 'A1 — Opening' },
  { id: 'a2', name: 'A2 — Development' },
  { id: 'b', name: 'B — Contrast' },
  { id: 'cadential', name: 'Cadential' },
  { id: 'experiments', name: 'Experiments' },
];

export const CATEGORY_LABEL: Record<MotifCategory, string> = {
  core: 'Core Library',
  user: 'User Motifs',
  rhythmic: 'Rhythmic',
};

interface MotifSpec {
  id: string;
  symbol: string;
  category: MotifCategory;
  groups?: Array<'intervals' | 'contour'>;
  collections: string[];
  tags: string[];
  description: string;
  mood?: string;
  favourite?: boolean;
  bars: number;
  src: string;
  scale?: ScaleRef;
}

const MOTIF_SPECS: MotifSpec[] = [
  { id: 'alpha', symbol: 'α', category: 'core', groups: ['contour'], collections: ['a1'], tags: ['rising', 'stepwise', 'sequence'], description: 'Stepwise ascent with gentle descent. Works well for opening statements and transitions.', bars: 4, src: MOTIF_ALPHA },
  { id: 'beta', symbol: 'β', category: 'core', groups: ['intervals'], collections: ['a2'], tags: ['leap', 'answer'], description: 'A falling third answered by an upward leap and a stepwise fill. A natural consequent to α.', bars: 2, src: MOTIF_BETA },
  { id: 'gamma', symbol: 'γ', category: 'core', groups: ['contour'], collections: ['b'], tags: ['descending', 'sigh'], description: 'Descending sighs over a long–short pulse; contrast material for B sections.', mood: 'Melancholic', bars: 2, src: MOTIF_GAMMA },
  { id: 'delta', symbol: 'δ', category: 'core', groups: ['intervals'], collections: ['a1'], tags: ['triad', 'fanfare'], description: 'Arpeggiated tonic triad rising to the octave.', mood: 'Bold', bars: 1, src: 'C4/2 Eb4/2 G4/2 C5/2 G4/4 Eb4/4' },
  { id: 'epsilon', symbol: 'ε', category: 'core', groups: ['contour'], collections: ['a2'], tags: ['turn', 'neighbour'], description: 'Turn figure circling the dominant.', bars: 1, src: 'G4/2 Ab4/2 G4/2 F#4/2 G4/8' },
  { id: 'zeta', symbol: 'ζ', category: 'core', collections: ['cadential'], tags: ['cadence', 'closing'], description: 'Closing formula 3–2–1 with a leading-tone approach.', mood: 'Resolved', bars: 2, src: 'Eb4/4 D4/4 F4/2 D4/2 B3/4 | C4/12 r/4' },
  { id: 'eta', symbol: 'η', category: 'core', groups: ['intervals'], collections: ['a2', 'experiments'], tags: ['fourths', 'open'], description: 'Chain of rising fourths, bright and unresolved.', mood: 'Bright', bars: 1, src: 'C4/4 F4/4 Bb4/4 Eb5/4' },
  { id: 'theta', symbol: 'θ', category: 'core', groups: ['contour'], collections: ['b'], tags: ['valley'], description: 'Dip to the lower neighbour before a wide recovery.', bars: 2, src: 'G4/4 F4/4 Eb4/4 D4/4 | C4/4 D4/4 G4/8' },
  { id: 'iota', symbol: 'ι', category: 'core', collections: ['cadential'], tags: ['half cadence'], description: 'Stepwise approach to the dominant; ends on an open half cadence.', bars: 1, src: 'C5/4 Bb4/2 Ab4/2 G4/8' },
  { id: 'kappa', symbol: 'κ', category: 'core', collections: ['a1', 'cadential'], tags: ['anacrusis'], description: 'Anacrusis figure landing on a strong downbeat.', bars: 2, src: 'r/10 G4/2 Ab4/2 B4/2 | C5/12 r/4' },
  { id: 'lambda', symbol: 'λ', category: 'core', groups: ['contour'], collections: ['a2'], tags: ['ascending', 'scalar'], description: 'Scalar run up an octave — energetic and directional.', mood: 'Energetic', bars: 1, src: 'C4/1 D4/1 Eb4/1 F4/1 G4/1 Ab4/1 Bb4/1 C5/1 D5/4 C5/4' },
  { id: 'mu', symbol: 'μ', category: 'core', groups: ['intervals'], collections: ['experiments'], tags: ['chromatic', 'tension'], description: 'Chromatic neighbour cluster around the fifth.', mood: 'Tense', bars: 1, src: 'G4/2 F#4/2 G4/2 Ab4/2 G4/4 r/4' },
  { id: 'nu', symbol: 'ν', category: 'user', groups: ['contour'], collections: ['a1'], tags: ['arch', 'lyrical'], description: 'Lyrical arch with a held apex.', mood: 'Lyrical', favourite: true, bars: 2, src: 'Eb4/4 F4/4 G4/4 Bb4/4 | C5/8 Bb4/4 G4/4' },
  { id: 'xi', symbol: 'ξ', category: 'user', collections: ['a2'], tags: ['sequence'], description: 'Two-note cell sequenced downward by step.', bars: 1, src: 'Eb5/2 C5/2 D5/2 Bb4/2 C5/2 Ab4/2 Bb4/4' },
  { id: 'omicron', symbol: 'ο', category: 'user', groups: ['intervals'], collections: ['b'], tags: ['octave', 'leap'], description: 'Octave leap with stepwise descent — a bold contrast gesture.', mood: 'Bold', bars: 1, src: 'C4/4 C5/4 Bb4/2 Ab4/2 G4/4' },
  { id: 'pi', symbol: 'π', category: 'user', groups: ['contour'], collections: ['a2', 'experiments'], tags: ['wave', 'thirds'], description: 'Undulating line alternating thirds and steps.', bars: 2, src: 'C4/2 Eb4/2 D4/2 F4/2 Eb4/2 G4/2 F4/2 Ab4/2 | G4/8 r/8' },
  { id: 'rho', symbol: 'ρ', category: 'user', collections: ['cadential'], tags: ['cadence', 'plagal'], description: 'Soft plagal close through the subdominant.', mood: 'Calm', favourite: true, bars: 2, src: 'F4/4 Ab4/4 G4/4 F4/4 | Eb4/4 D4/4 C4/8' },
  { id: 'sigma', symbol: 'σ', category: 'user', groups: ['contour'], collections: ['experiments'], tags: ['descending', 'dotted'], description: 'Falling line in dotted rhythm.', bars: 1, src: 'G5/3 F5/1 Eb5/3 D5/1 C5/3 Bb4/1 Ab4/4' },
  { id: 'tau', symbol: 'τ', category: 'user', groups: ['intervals'], collections: ['cadential'], tags: ['leading tone'], description: 'Leading-tone resolution preceded by a falling fifth.', bars: 1, src: 'G4/4 C4/4 B3/4 C4/4' },
  { id: 'upsilon', symbol: 'υ', category: 'user', collections: ['a2'], tags: ['dorian', 'modal'], description: 'Dorian colour with the raised sixth.', mood: 'Modal', bars: 1, src: 'D4/2 E4/2 F4/2 G4/2 A4/2 B4/2 A4/4', scale: { tonic: 2, mode: 'dorian' } },
  { id: 'phi', symbol: 'φ', category: 'rhythmic', collections: ['b'], tags: ['syncopation'], description: 'Syncopated short–long cell.', bars: 1, src: 'G4/2 G4/4 G4/2 G4/4 G4/4' },
  { id: 'chi', symbol: 'χ', category: 'rhythmic', collections: ['cadential'], tags: ['dotted', 'march'], description: 'Dotted march figure for cadential drive.', favourite: true, bars: 1, src: 'C4/3> C4/1 C4/3 C4/1 C4/8' },
  { id: 'psi', symbol: 'ψ', category: 'rhythmic', collections: ['a1'], tags: ['gallop'], description: 'Gallop rhythm: an eighth and two sixteenths.', bars: 1, src: 'Eb4/2 Eb4/1 Eb4/1 G4/2 G4/1 G4/1 C5/2 C5/1 C5/1 G4/4' },
  { id: 'omega', symbol: 'ω', category: 'rhythmic', collections: ['experiments'], tags: ['3+3+2', 'grouping'], description: '3+3+2 accent grouping across the bar.', bars: 1, src: 'C5/6> G4/6> Eb5/4>' },
];

export function motifLibrary(): Motif[] {
  return MOTIF_SPECS.map((s) => ({
    id: s.id,
    symbol: s.symbol,
    name: `Motif ${s.symbol}`,
    category: s.category,
    groups: s.groups ?? [],
    collections: s.collections,
    tags: s.tags,
    description: s.description,
    mood: s.mood ?? 'Neutral',
    favourite: s.favourite ?? false,
    bars: s.bars,
    notes: mel(s.src),
    scale: s.scale ?? C_MINOR,
  }));
}

export const MOODS = ['Neutral', 'Lyrical', 'Bold', 'Bright', 'Calm', 'Energetic', 'Melancholic', 'Modal', 'Resolved', 'Tense'];

// ---------------------------------------------------------------------------
// Templates

export type TemplateId = 'empty' | 'melody' | 'counterpoint' | 'rhythmic' | 'modal' | 'form';

export const TEMPLATES: Array<{ id: TemplateId; name: string; hint: string }> = [
  { id: 'empty', name: 'Empty Project', hint: 'Start from scratch' },
  { id: 'melody', name: 'Melody Study', hint: 'Single staff' },
  { id: 'counterpoint', name: 'Counterpoint', hint: 'Multiple staves' },
  { id: 'rhythmic', name: 'Rhythmic Study', hint: 'Percussive focus' },
  { id: 'modal', name: 'Modal Exploration', hint: 'Mode and scale' },
  { id: 'form', name: 'Form Sketch', hint: 'Sections and form' },
];

export function projectFromTemplate(
  template: TemplateId,
  opts: { name: string; key: ScaleRef; meter: Meter; tempo: number },
): Project {
  const now = new Date().toISOString();
  const base = { name: opts.name, key: opts.key, meter: opts.meter, tempo: opts.tempo, createdAt: now, modifiedAt: now };
  const empty = (label: string, member: string, bars: number, cadence: CadenceType = 'open'): DrawingSpec => ({ label, member, bars, src: '', cadence });
  switch (template) {
    case 'melody':
      return buildProject({ ...base, subtitle: 'Melodic study', kind: 'Study', drawings: [{ label: 'A1', member: 'A', bars: 2, src: 'C4/4 D4/4 Eb4/4 F4/4 | G4/12 r/4', cadence: 'quarter' }, empty('A2', 'A', 2, 'full')] });
    case 'counterpoint':
      return buildProject({ ...base, subtitle: 'Two voices', lowerVoice: mel('C3/16 | G2/16 | Ab2/16 | G2/16', 70), drawings: [{ label: 'A1', member: 'A', bars: 4, src: 'G4/8 Ab4/8 | G4/4 F4/4 Eb4/8 | C5/8 Bb4/8 | B4/16', cadence: 'half' }] });
    case 'rhythmic':
      return buildProject({ ...base, subtitle: 'Rhythmic study', kind: 'Study', percussive: true, drawings: [{ label: 'A1', member: 'A', bars: 2, src: 'C5/4> C5/2 C5/2 C5/4 C5/4 | C5/2 C5/2 C5/4> C5/4 C5/4', cadence: 'full' }] });
    case 'modal':
      return buildProject({ ...base, subtitle: 'Modal exploration', kind: 'Study', key: { tonic: 2, mode: 'dorian' }, drawings: [{ label: 'A1', member: 'A', bars: 2, src: 'D4/4 E4/4 F4/4 G4/4 | A4/4 B4/4 A4/8', cadence: 'half' }] });
    case 'form':
      return buildProject({ ...base, subtitle: 'Form sketch', drawings: [empty('A1', 'A', 4), empty('A2', 'A', 4, 'quarter'), empty("A1'", "A'", 4, 'half'), empty('B1', 'B', 2), empty('B2', 'B', 2, 'full')] });
    case 'empty':
    default:
      return buildProject({ ...base, subtitle: 'Composition', drawings: [empty('A1', 'A', 4, 'full')] });
  }
}
