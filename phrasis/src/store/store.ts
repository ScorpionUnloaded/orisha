import { create } from 'zustand';
import { engine } from '../audio/engine';
import type { PlayEvent } from '../audio/engine';
import { classifyContour } from '../model/analysis';
import type { RhythmCharacter, SymmetryKind } from '../model/analysis';
import { demoProject, motifLibrary, projectFromTemplate, recentProjects, stepsFor } from '../model/demo';
import type { TemplateId } from '../model/demo';
import { rerhythm, rhythmTemplate } from '../model/rhythmTemplates';
import { absoluteNotes, barTicks, deriveMembers, placeDrawings, totalBars, uid } from '../model/syntax';
import type { AbsNote } from '../model/syntax';
import { keyFifths, sameScale } from '../model/theory';
import {
  applyContour,
  applyRhythm,
  invert,
  quantize,
  remapScale,
  retrograde,
  retrogradeInversion,
  scaleTime,
  sequence,
  sorted,
  stepsToRhythm,
  swing,
  transposeDiatonic,
  melodyToSteps,
  rhythmicVariation,
  contourOnly,
  scalePitch,
} from '../model/transforms';
import type { ContourShape } from '../model/transforms';
import { T16, T8, TPQ } from '../model/types';
import type {
  CadenceType,
  Drawing,
  Lane,
  Meter,
  Motif,
  Note,
  PeriodRules,
  Project,
  RhythmSettings,
  ScaleRef,
  StepValue,
  TransformKind,
} from '../model/types';
import { variation } from '../model/variations';
import type { VariationId } from '../model/variations';

export type View = 'home' | 'composer' | 'rhythm' | 'motif' | 'period';
export type SyntaxSel = { kind: 'period' } | { kind: 'member'; id: string } | { kind: 'drawing'; id: string };
export type LibraryFilter =
  | { kind: 'all' | 'user' | 'core' | 'rhythmic' | 'intervals' | 'contour' | 'favourites' }
  | { kind: 'collection'; id: string };
export type HomeSection = 'home' | 'templates' | 'studies' | 'archives' | 'all';

interface Snapshot {
  projects: Project[];
  library: Motif[];
}

export interface Toast {
  id: number;
  text: string;
}

export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export interface AppState {
  view: View;
  projects: Project[];
  archived: string[];
  projectId: string;
  library: Motif[];
  selection: SyntaxSel;
  noteSel: string[];
  homeProjectId: string;
  homeSection: HomeSection;
  motifId: string;
  libraryFilter: LibraryFilter;
  motifVariation: VariationId;
  melodicShow: 'pitches' | 'contour' | 'syntax';
  rhythmShow: 'staff' | 'onsets' | 'density' | 'pattern';
  motifShow: 'contour' | 'pitches' | 'rhythm' | 'both';
  motifTool: 'draw' | 'erase' | 'select' | 'pointer';
  noteLength: number;
  snap: number;
  scaleQuantize: boolean;
  zoom: number;
  scrollBar: number;
  playing: boolean;
  loop: boolean;
  recording: boolean;
  playhead: number;
  volume: number;
  expanded: Record<string, boolean>;
  toasts: Toast[];
  modal: null | { kind: 'variations'; drawingId: string } | { kind: 'new-project'; template: TemplateId } | { kind: 'shortcuts' };
  past: Snapshot[];
  future: Snapshot[];
}

const STORAGE_KEY = 'phrasis.v1';

function loadSaved(): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { projects: Project[]; library: Motif[]; projectId: string; archived?: string[] };
    if (!Array.isArray(data.projects) || !data.projects.length || !Array.isArray(data.library)) return null;
    return { projects: data.projects, library: data.library, projectId: data.projectId, archived: data.archived ?? [] };
  } catch {
    return null;
  }
}

function initialView(): View {
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  return (['home', 'composer', 'rhythm', 'motif', 'period'] as View[]).includes(h as View) ? (h as View) : 'home';
}

function initial(): AppState {
  const saved = loadSaved();
  const projects = saved?.projects ?? recentProjects();
  const library = saved?.library ?? motifLibrary();
  const projectId = saved?.projectId && projects.some((p) => p.id === saved.projectId) ? saved.projectId : projects[0].id;
  const project = projects.find((p) => p.id === projectId)!;
  const secondDrawing = project.drawings[1] ?? project.drawings[0];
  return {
    view: initialView(),
    projects,
    archived: saved?.archived ?? [],
    projectId,
    library,
    selection: { kind: 'drawing', id: secondDrawing.id },
    noteSel: [],
    homeProjectId: projectId,
    homeSection: 'home',
    motifId: project.motifs[0] ?? library[0].id,
    libraryFilter: { kind: 'all' },
    motifVariation: 'original',
    melodicShow: 'pitches',
    rhythmShow: 'staff',
    motifShow: 'contour',
    motifTool: 'draw',
    noteLength: T8,
    snap: T8,
    scaleQuantize: false,
    zoom: 1,
    scrollBar: 0,
    playing: false,
    loop: false,
    recording: false,
    playhead: 0,
    volume: 0.8,
    expanded: { period: true, [`member:${project.drawings[0].id}`]: true },
    toasts: [],
    modal: null,
    past: [],
    future: [],
  };
}

export const useApp = create<AppState>(() => initial());
const set = useApp.setState;
const get = useApp.getState;

// ---------------------------------------------------------------------------
// Selectors

export const currentProject = (s: AppState = get()) => s.projects.find((p) => p.id === s.projectId)!;
export const useProject = () => useApp((s) => s.projects.find((p) => p.id === s.projectId)!);
export const currentMotif = (s: AppState = get()) => s.library.find((m) => m.id === s.motifId) ?? s.library[0];

export function selectedDrawing(s: AppState = get()): Drawing | undefined {
  const p = currentProject(s);
  if (s.selection.kind === 'drawing') {
    const id = s.selection.id;
    return p.drawings.find((d) => d.id === id);
  }
  return undefined;
}

/** Bars shown by the time-aligned editors. */
export function viewWindow(s: AppState = get()): { start: number; bars: number } {
  const p = currentProject(s);
  const total = totalBars(p);
  const bars = Math.min(total, Math.max(1, Math.round(8 / s.zoom)));
  const start = Math.max(0, Math.min(s.scrollBar, total - bars));
  return { start, bars };
}

// ---------------------------------------------------------------------------
// History & persistence

let saveTimer: number | null = null;
function persist() {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const s = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: s.projects, library: s.library, projectId: s.projectId, archived: s.archived }));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  }, 400);
}

function snapshot(s: AppState): Snapshot {
  return { projects: s.projects, library: s.library };
}

function commitProjects(projects: Project[], library?: Library) {
  set((s) => ({ past: [...s.past, snapshot(s)].slice(-100), future: [], projects, library: library ?? s.library }));
  persist();
}
type Library = Motif[];

/** Apply a mutation to a clone of the current project and record it for undo. */
export function editProject(fn: (p: Project) => void, id = get().projectId) {
  const s = get();
  const projects = s.projects.map((p) => {
    if (p.id !== id) return p;
    const draft = structuredClone(p);
    fn(draft);
    draft.modifiedAt = new Date().toISOString();
    return draft;
  });
  commitProjects(projects);
}

export function editLibrary(fn: (lib: Motif[]) => Motif[]) {
  const s = get();
  set({ past: [...s.past, snapshot(s)].slice(-100), future: [], library: fn(structuredClone(s.library)) });
  persist();
}

export function undo() {
  const s = get();
  const prev = s.past[s.past.length - 1];
  if (!prev) return;
  set({ past: s.past.slice(0, -1), future: [snapshot(s), ...s.future], ...prev });
  fixSelection();
  persist();
}

export function redo() {
  const s = get();
  const next = s.future[0];
  if (!next) return;
  set({ future: s.future.slice(1), past: [...s.past, snapshot(s)], ...next });
  fixSelection();
  persist();
}

function fixSelection() {
  const s = get();
  const p = currentProject(s);
  if (s.selection.kind === 'drawing') {
    const id = s.selection.id;
    if (!p.drawings.some((d) => d.id === id)) set({ selection: { kind: 'drawing', id: p.drawings[0].id } });
  }
  const ids = new Set(p.drawings.flatMap((d) => d.notes.map((n) => n.id)));
  set({ noteSel: s.noteSel.filter((id) => ids.has(id)) });
}

let toastId = 0;
export function toast(text: string) {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts, { id, text }] }));
  window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
}

// ---------------------------------------------------------------------------
// Navigation & selection

export function setView(view: View) {
  set({ view });
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
}

export function openProject(id: string, view: View = 'composer') {
  const p = get().projects.find((x) => x.id === id);
  if (!p) return;
  stop();
  const second = p.drawings[1] ?? p.drawings[0];
  set({
    projectId: id,
    homeProjectId: id,
    selection: { kind: 'drawing', id: second.id },
    noteSel: [],
    scrollBar: 0,
    playhead: 0,
    motifId: p.motifs[0] ?? get().motifId,
    expanded: { ...get().expanded, period: true, [`member:${p.drawings[0].id}`]: true },
  });
  setView(view);
  persist();
}

export function select(sel: SyntaxSel) {
  const s = get();
  const p = currentProject(s);
  set({ selection: sel, noteSel: [] });
  // Keep the selected unit in view.
  let startBar = -1;
  let endBar = -1;
  if (sel.kind === 'drawing') {
    const pl = placeDrawings(p).find((x) => x.drawing.id === sel.id);
    if (pl) {
      startBar = pl.startBar;
      endBar = pl.endBar;
    }
    const member = deriveMembers(p).find((m) => m.drawingIds.includes(sel.id));
    if (member) set({ expanded: { ...get().expanded, [member.id]: true } });
  } else if (sel.kind === 'member') {
    const m = deriveMembers(p).find((x) => x.id === sel.id);
    if (m) {
      startBar = m.startBar;
      endBar = m.endBar;
    }
  }
  if (startBar >= 0) {
    const win = viewWindow(get());
    if (startBar < win.start || endBar > win.start + win.bars) {
      const member = deriveMembers(p).find((m) => m.startBar <= startBar && m.endBar > startBar);
      set({ scrollBar: member && endBar - member.startBar <= win.bars ? member.startBar : startBar });
    }
  }
}

export function selectNotes(ids: string[], additive = false) {
  set((s) => ({ noteSel: additive ? Array.from(new Set([...s.noteSel, ...ids])) : ids }));
}

export function toggleExpanded(id: string) {
  set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } }));
}

export function setZoom(dir: 1 | -1) {
  const i = ZOOMS.indexOf(get().zoom);
  const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + dir))];
  set({ zoom: next });
}

export function scrollBy(bars: number) {
  const s = get();
  const total = totalBars(currentProject(s));
  const win = viewWindow(s);
  set({ scrollBar: Math.max(0, Math.min(total - win.bars, win.start + bars)) });
}

export const setUi = (patch: Partial<AppState>) => set(patch);

// ---------------------------------------------------------------------------
// Note editing (absolute ticks, redistributed to the owning drawing)

function redistribute(p: Project, notes: Array<Note & { abs: number }>) {
  const placed = placeDrawings(p);
  const total = placed.length ? placed[placed.length - 1].endTick : 0;
  const buckets: Note[][] = placed.map(() => []);
  for (const n of notes) {
    const abs = Math.max(0, Math.min(total - T16, n.abs));
    let idx = placed.findIndex((pl) => abs >= pl.startTick && abs < pl.endTick);
    if (idx < 0) idx = placed.length - 1;
    const { abs: _abs, drawingId: _d, ...rest } = n as AbsNote;
    void _abs;
    void _d;
    buckets[idx].push({ ...rest, start: abs - placed[idx].startTick });
  }
  p.drawings.forEach((d, i) => (d.notes = sorted(buckets[i])));
}

export function editNotes(fn: (notes: AbsNote[]) => Array<Note & { abs: number }>) {
  editProject((p) => redistribute(p, fn(absoluteNotes(p))));
}

export function moveNotes(ids: string[], dTick: number, dPitch: number) {
  if (!ids.length || (!dTick && !dPitch)) return;
  const sel = new Set(ids);
  editNotes((notes) => notes.map((n) => (sel.has(n.id) ? { ...n, abs: n.abs + dTick, pitch: Math.max(21, Math.min(108, n.pitch + dPitch)) } : n)));
}

export function resizeNotes(ids: string[], dDur: number) {
  if (!ids.length || !dDur) return;
  const sel = new Set(ids);
  editNotes((notes) => notes.map((n) => (sel.has(n.id) ? { ...n, dur: Math.max(T16 / 2, n.dur + dDur) } : n)));
}

export function addNote(abs: number, pitch: number, dur: number) {
  const id = uid('n');
  editNotes((notes) => [...notes, { id, abs, start: 0, pitch, dur, vel: 86, drawingId: '' }]);
  set({ noteSel: [id] });
  engine.audition([{ pitch, start: 0, dur: Math.min(dur, TPQ), vel: 90 }], currentProject().tempo);
  return id;
}

export function deleteNotes(ids: string[]) {
  if (!ids.length) return;
  const sel = new Set(ids);
  editNotes((notes) => notes.filter((n) => !sel.has(n.id)));
  set({ noteSel: [] });
}

export function setArticulation(ids: string[], art: Note['art']) {
  const sel = new Set(ids);
  editNotes((notes) => notes.map((n) => (sel.has(n.id) ? { ...n, art: n.art === art ? undefined : art } : n)));
}

/** Diatonic transposition of the current note selection (or selected drawing). */
export function transposeSelection(steps: number, octave = false) {
  const s = get();
  const p = currentProject(s);
  const ids = s.noteSel.length ? new Set(s.noteSel) : new Set(selectedDrawing(s)?.notes.map((n) => n.id) ?? []);
  editNotes((notes) =>
    notes.map((n) => {
      if (!ids.has(n.id)) return n;
      if (octave) return { ...n, pitch: n.pitch + 12 * steps };
      const d = p.drawings.find((x) => x.id === n.drawingId);
      const moved = transposeDiatonic([n], steps, d?.scale ?? p.key)[0];
      return { ...n, pitch: moved.pitch };
    }),
  );
}

// ---------------------------------------------------------------------------
// Drawing-level operations

function drawingLength(p: Project, d: Drawing) {
  return d.bars * barTicks(p.meter);
}

function fitMotif(p: Project, d: Drawing, m: Motif): Note[] {
  const len = drawingLength(p, d);
  const mLen = m.bars * barTicks(p.meter);
  let notes = remapScale(m.notes, m.scale, d.scale);
  if (mLen !== len) notes = scaleTime(notes, len / mLen);
  return notes;
}

export function transformNotes(kind: TransformKind, notes: Note[], len: number, scale: ScaleRef): Note[] {
  switch (kind) {
    case 'transpose':
      return transposeDiatonic(notes, 2, scale);
    case 'invert':
      return invert(notes, scale);
    case 'retrograde':
      return retrograde(notes, len);
    case 'retrograde-inversion':
      return retrogradeInversion(notes, len, scale);
    case 'augment':
      return scaleTime(notes, 2).filter((n) => n.start < len).map((n) => ({ ...n, dur: Math.min(n.dur, len - n.start) }));
    case 'diminish': {
      const half = scaleTime(notes, 0.5);
      return [...half, ...half.map((n) => ({ ...n, id: uid('n'), start: n.start + len / 2 }))];
    }
    case 'sequence':
      return sequence(notes, 2, len, scale);
    case 'rhythmic':
      return rhythmicVariation(notes);
    case 'contour':
      return contourOnly(notes, scale);
    default:
      return notes.map((n) => ({ ...n }));
  }
}

export const TRANSFORM_LABEL: Record<TransformKind, string> = {
  none: 'None',
  transpose: 'Transposed',
  invert: 'Inverted',
  retrograde: 'Retrograde',
  'retrograde-inversion': 'Retrograde inv.',
  augment: 'Augmented',
  diminish: 'Diminished',
  sequence: 'Sequence',
  rhythmic: 'Rhythmic var.',
  contour: 'Contour only',
};

/** Regenerate a drawing as a transformation of its motif (or of itself without a motif). */
export function setDrawingTransform(drawingId: string, kind: TransformKind) {
  const lib = get().library;
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    const m = lib.find((x) => x.id === d.motifRef);
    const len = drawingLength(p, d);
    const base = m ? fitMotif(p, d, m) : d.notes;
    d.notes = sorted(transformNotes(kind, base, len, d.scale));
    d.transform = kind;
  });
}

/** One-shot transformation applied to the drawing's current notes. */
export function applyDrawingTransform(drawingId: string, kind: TransformKind) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    d.notes = sorted(transformNotes(kind, d.notes, drawingLength(p, d), d.scale));
    d.transform = kind;
  });
}

export function setDrawingNotes(drawingId: string, notes: Note[], transform?: TransformKind) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    d.notes = sorted(notes.map((n) => ({ ...n, id: uid('n') })));
    if (transform) d.transform = transform;
  });
}

export function setDrawingContour(drawingId: string, shape: ContourShape) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    if (classifyContour(d.notes) === shape) return;
    d.notes = applyContour(d.notes, shape, drawingLength(p, d), d.scale);
  });
}

export function setDrawingScale(drawingId: string, scale: ScaleRef) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d || sameScale(d.scale, scale)) return;
    d.notes = remapScale(d.notes, d.scale, scale);
    d.scale = scale;
  });
}

export function setDrawingRhythm(drawingId: string, kind: RhythmCharacter) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    d.notes = rerhythm(d.notes, rhythmTemplate(kind, drawingLength(p, d)));
  });
}

export function setDrawingSymmetry(drawingId: string, kind: SymmetryKind) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    const len = drawingLength(p, d);
    const half = len / 2;
    const s = sorted(d.notes);
    const first = s.filter((n) => n.start < half);
    const second = s.filter((n) => n.start >= half);
    if (kind === 'asymmetric') {
      d.notes = sorted([...first, ...transposeDiatonic(second, 1, d.scale)]);
      return;
    }
    // Mirror: the second half retraces the first half's pitches in reverse.
    const mirrored = retrograde(first, half).map((n) => ({ ...n, start: n.start + half }));
    let out = [...first, ...mirrored];
    if (kind === 'near-symmetric' && second.length) {
      const keep = second.slice(-1);
      out = [...first, ...mirrored.filter((n) => n.start < keep[0].start), ...keep];
    }
    d.notes = sorted(out);
  });
}

export function setDrawingProp(drawingId: string, patch: Partial<Pick<Drawing, 'cadence' | 'motifRef' | 'label' | 'member'>>) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (d) Object.assign(d, patch);
    if ('motifRef' in patch && patch.motifRef && !p.motifs.includes(patch.motifRef)) p.motifs.push(patch.motifRef);
  });
}

export function setCadence(drawingId: string, type: CadenceType) {
  setDrawingProp(drawingId, { cadence: type });
}

export function setDrawingBars(drawingId: string, bars: number) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d || d.bars === bars) return;
    d.notes = scaleTime(d.notes, bars / d.bars);
    d.bars = bars;
  });
}

export function reorderDrawings(from: number, to: number) {
  if (from === to) return;
  editProject((p) => {
    const [d] = p.drawings.splice(from, 1);
    p.drawings.splice(to, 0, d);
  });
}

function nextLabel(p: Project, member: string): string {
  const letter = member.replace(/'/g, '');
  let n = 1;
  const labels = new Set(p.drawings.map((d) => d.label));
  while (labels.has(`${letter}${n}`)) n++;
  return `${letter}${n}`;
}

export function addDrawing(afterId?: string) {
  const s = get();
  const p = currentProject(s);
  const after = p.drawings.find((d) => d.id === (afterId ?? (s.selection.kind === 'drawing' ? s.selection.id : '')));
  const member = after?.member ?? 'A';
  const d: Drawing = {
    id: uid('d'),
    label: nextLabel(p, member),
    member,
    bars: 2,
    notes: [],
    cadence: 'open',
    scale: after?.scale ?? p.key,
    transform: 'none',
  };
  editProject((draft) => {
    const idx = after ? draft.drawings.findIndex((x) => x.id === after.id) + 1 : draft.drawings.length;
    draft.drawings.splice(idx, 0, d);
    draft.steps = stepsFor(draft);
  });
  select({ kind: 'drawing', id: d.id });
  toast(`Added drawing ${d.label}`);
}

export function addMember() {
  const p = currentProject();
  const keys = new Set(p.drawings.map((d) => d.member));
  const letter = 'ABCDEFGH'.split('').find((l) => !keys.has(l)) ?? `M${keys.size + 1}`;
  const d: Drawing = { id: uid('d'), label: `${letter}1`, member: letter, bars: 2, notes: [], cadence: 'half', scale: p.key, transform: 'none' };
  editProject((draft) => {
    draft.drawings.push(d);
    draft.steps = stepsFor(draft);
  });
  select({ kind: 'drawing', id: d.id });
  toast(`Added Member ${letter}`);
}

export function deleteDrawing(id: string) {
  const p = currentProject();
  if (p.drawings.length <= 1) {
    toast('A period needs at least one drawing');
    return;
  }
  editProject((draft) => {
    draft.drawings = draft.drawings.filter((d) => d.id !== id);
    draft.steps = stepsFor(draft);
  });
  fixSelection();
}

export function setRegionScale(regionId: string, scale: ScaleRef) {
  editProject((p) => {
    const r = p.regions.find((x) => x.id === regionId);
    if (r) r.scale = scale;
  });
}

export function setRules(patch: Partial<PeriodRules>) {
  editProject((p) => Object.assign(p.rules, patch));
}

export function setProjectMeta(patch: Partial<Pick<Project, 'name' | 'subtitle' | 'memo' | 'keywords' | 'form' | 'kind'>>, id = get().projectId) {
  editProject((p) => Object.assign(p, patch), id);
}

// ---------------------------------------------------------------------------
// Global key / meter / tempo

export function setKey(scale: ScaleRef) {
  const p = currentProject();
  if (sameScale(p.key, scale)) return;
  const shift = scale.tonic - p.key.tonic;
  const moveScale = (s: ScaleRef): ScaleRef => ({ tonic: (((s.tonic + shift) % 12) + 12) % 12, mode: s.mode === p.key.mode ? scale.mode : s.mode });
  editProject((draft) => {
    for (const d of draft.drawings) {
      const to = moveScale(d.scale);
      d.notes = remapScale(d.notes, d.scale, to);
      d.scale = to;
    }
    for (const r of draft.regions) r.scale = moveScale(r.scale);
    if (draft.lowerVoice) draft.lowerVoice = remapScale(draft.lowerVoice, p.key, scale);
    draft.key = scale;
  });
  toast(`Re-expressed in ${scale.tonic === p.key.tonic ? 'new mode' : 'new key'}`);
}

export function setMeter(meter: Meter) {
  const p = currentProject();
  if (p.meter.num === meter.num && p.meter.den === meter.den) return;
  const oldBar = barTicks(p.meter);
  const newBar = barTicks(meter);
  editProject((draft) => {
    for (const d of draft.drawings) {
      d.bars = Math.max(1, Math.round((d.bars * oldBar) / newBar));
      const len = d.bars * newBar;
      d.notes = d.notes.filter((n) => n.start < len).map((n) => ({ ...n, dur: Math.min(n.dur, len - n.start) }));
    }
    draft.meter = meter;
    draft.steps = stepsFor(draft);
  });
}

export function setTempo(tempo: number) {
  const t = Math.max(30, Math.min(300, Math.round(tempo)));
  editProject((p) => (p.tempo = t));
  engine.setTempo(t);
}

// ---------------------------------------------------------------------------
// Rhythm lab

export function setRhythm<K extends keyof RhythmSettings>(key: K, value: RhythmSettings[K]) {
  editProject((p) => (p.rhythm[key] = value));
}

/** Notes targeted by rhythm operations, as absolute notes. */
export function rhythmTargetRange(s: AppState = get()): { from: number; to: number; ids: Set<string> } {
  const p = currentProject(s);
  const target = p.rhythm.target;
  const placed = placeDrawings(p);
  const abs = absoluteNotes(p);
  const drawingId = s.selection.kind === 'drawing' ? s.selection.id : placed[0]?.drawing.id;
  if (target === 'selected' && s.noteSel.length) {
    const sel = abs.filter((n) => s.noteSel.includes(n.id));
    const from = Math.min(...sel.map((n) => n.abs));
    const to = Math.max(...sel.map((n) => n.abs + n.dur));
    return { from, to, ids: new Set(s.noteSel) };
  }
  if (target === 'period') {
    const end = placed[placed.length - 1]?.endTick ?? 0;
    return { from: 0, to: end, ids: new Set(abs.map((n) => n.id)) };
  }
  if (target === 'member') {
    const m = deriveMembers(p).find((x) => x.drawingIds.includes(drawingId));
    const bt = barTicks(p.meter);
    const from = (m?.startBar ?? 0) * bt;
    const to = (m?.endBar ?? 0) * bt;
    return { from, to, ids: new Set(abs.filter((n) => n.abs >= from && n.abs < to).map((n) => n.id)) };
  }
  const pl = placed.find((x) => x.drawing.id === drawingId) ?? placed[0];
  return { from: pl.startTick, to: pl.endTick, ids: new Set(pl.drawing.notes.map((n) => n.id)) };
}

export function extractRhythmFromSelection() {
  const s = get();
  const p = currentProject(s);
  const { from, to } = rhythmTargetRange(s);
  const bt = barTicks(p.meter);
  const quant = p.rhythm.quantizeInput === '8' ? T8 : T16;
  const src = absoluteNotes(p).map((n) => ({ ...n, start: n.abs }));
  const q = quantize(src, quant, 1);
  const bars = totalBars(p);
  const fresh = melodyToSteps(q, bars, p.meter, 8, p.rhythm.sensitivity);
  const stepLen = bt / 8;
  const a = Math.floor(from / stepLen);
  const b = Math.ceil(to / stepLen);
  editProject((draft) => {
    for (const lane of ['hihat', 'snare', 'kick', 'other'] as Lane[]) {
      const arr = draft.steps.lanes[lane].length === bars * 8 ? draft.steps.lanes[lane] : fresh.lanes[lane].slice();
      for (let i = a; i < b; i++) arr[i] = fresh.lanes[lane][i];
      draft.steps.lanes[lane] = arr;
    }
  });
  toast('Rhythm extracted to the step pattern');
}

export function toggleStep(lane: Lane, index: number) {
  editProject((p) => {
    const v = p.steps.lanes[lane][index] ?? 0;
    const next: StepValue = v === 0 ? 2 : v === 2 ? 3 : v === 3 ? 1 : 0;
    p.steps.lanes[lane][index] = next;
  });
}

export function applyRhythmPipeline() {
  const s = get();
  const p = currentProject(s);
  const { from, to, ids } = rhythmTargetRange(s);
  if (!ids.size) {
    toast('Nothing to apply to');
    return;
  }
  const r = p.rhythm;
  const stepLen = barTicks(p.meter) / p.steps.perBar;
  const grid = { '4': TPQ, '8': T8, '16': T16, '32': T16 / 2 }[r.grid];
  editNotes((notes) => {
    const target = notes.filter((n) => ids.has(n.id));
    const others = notes.filter((n) => !ids.has(n.id));
    let rel: Note[] = target.map((n) => ({ ...n, start: n.abs - from }));
    const rhythm = stepsToRhythm(p.steps, p.meter, Math.floor(from / stepLen), Math.ceil(to / stepLen));
    if (rhythm.length) rel = applyRhythm(rel, rhythm, r.mode, r.strength);
    rel = quantize(rel, grid, r.quantizeStrength);
    if (r.swing > 0) rel = swing(rel, r.swing, r.swingFeel);
    return [...others, ...rel.map((n) => ({ ...n, abs: n.start + from, drawingId: '' }))];
  });
  toast('Rhythm applied to selection');
}

// ---------------------------------------------------------------------------
// Motif library

export function selectMotif(id: string) {
  set({ motifId: id, motifVariation: 'original' });
}

export function updateMotif(id: string, patch: Partial<Motif>) {
  editLibrary((lib) => lib.map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

export function setMotifNotes(id: string, notes: Note[]) {
  updateMotif(id, { notes: sorted(notes) });
}

export function addMotif() {
  const s = get();
  const m: Motif = {
    id: uid('m'),
    symbol: '∗',
    name: `Motif ${s.library.length + 1}`,
    category: 'user',
    groups: [],
    collections: s.libraryFilter.kind === 'collection' ? [s.libraryFilter.id] : [],
    tags: [],
    description: '',
    mood: 'Neutral',
    favourite: false,
    bars: 2,
    notes: [],
    scale: currentProject(s).key,
  };
  editLibrary((lib) => [...lib, m]);
  set({ motifId: m.id, motifVariation: 'original' });
  toast('New motif — draw notes in the editor');
}

export function commitMotifVariation(asNew: boolean) {
  const s = get();
  const m = currentMotif(s);
  const len = m.bars * barTicks(currentProject(s).meter);
  const v = variation(s.motifVariation, m.notes, len, m.scale);
  const bars = Math.max(1, Math.round(v.length / barTicks(currentProject(s).meter)));
  if (asNew) {
    const id = uid('m');
    editLibrary((lib) => [...lib, { ...m, id, name: `${m.name} · ${s.motifVariation}`, symbol: m.symbol, notes: v.notes, bars, favourite: false, category: 'user' }]);
    set({ motifId: id, motifVariation: 'original' });
    toast('Saved as a new motif');
  } else {
    editLibrary((lib) => lib.map((x) => (x.id === m.id ? { ...x, notes: v.notes, bars } : x)));
    set({ motifVariation: 'original' });
    toast('Variation committed');
  }
}

/** Place a motif into the selected drawing (replacing its notes). */
export function placeMotifInDrawing(motifId: string, drawingId: string) {
  const m = get().library.find((x) => x.id === motifId);
  if (!m) return;
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    d.notes = fitMotif(p, d, m);
    d.motifRef = m.id;
    d.transform = 'none';
    if (!p.motifs.includes(m.id)) p.motifs.push(m.id);
    p.steps = stepsFor(p);
  });
  toast(`${m.name} placed in the drawing`);
}

export function addMotifToProject(motifId: string) {
  editProject((p) => {
    if (!p.motifs.includes(motifId)) p.motifs.push(motifId);
  });
}

// ---------------------------------------------------------------------------
// Projects

export function createProject(template: TemplateId, opts: { name: string; key: ScaleRef; meter: Meter; tempo: number }) {
  const p = projectFromTemplate(template, opts);
  commitProjects([p, ...get().projects]);
  openProject(p.id);
  toast(`Created “${p.name}”`);
}

export function duplicateProject(id: string) {
  const src = get().projects.find((p) => p.id === id);
  if (!src) return;
  const copy: Project = { ...structuredClone(src), id: uid('p'), name: `${src.name} copy`, modifiedAt: new Date().toISOString() };
  commitProjects([copy, ...get().projects]);
  set({ homeProjectId: copy.id });
}

export function archiveProject(id: string, archived = true) {
  set((s) => ({ archived: archived ? [...s.archived, id] : s.archived.filter((x) => x !== id) }));
  persist();
  toast(archived ? 'Moved to Archives' : 'Restored from Archives');
}

export function deleteProject(id: string) {
  const s = get();
  if (s.projects.length <= 1) return;
  const projects = s.projects.filter((p) => p.id !== id);
  commitProjects(projects);
  if (s.projectId === id) set({ projectId: projects[0].id });
  if (s.homeProjectId === id) set({ homeProjectId: projects[0].id });
}

export function resetDemo() {
  const projects = recentProjects();
  set({ projects, library: motifLibrary(), archived: [], past: [], future: [] });
  openProject(projects[0].id);
  persist();
}

export function importProject(p: Project) {
  const copy = { ...p, id: uid('p'), modifiedAt: new Date().toISOString() };
  if (!copy.steps?.lanes) copy.steps = stepsFor(copy);
  commitProjects([copy, ...get().projects]);
  openProject(copy.id);
}

export { demoProject };

// ---------------------------------------------------------------------------
// Transport

export function playEvents(p: Project): PlayEvent[] {
  const ev: PlayEvent[] = absoluteNotes(p).map((n) => ({ pitch: n.pitch, start: n.abs, dur: n.art === 'staccato' ? n.dur * 0.5 : n.dur, vel: n.vel }));
  for (const n of p.lowerVoice ?? []) ev.push({ pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel, soft: true });
  return ev;
}

let raf = 0;
function tick() {
  if (!engine.playing) return;
  set({ playhead: engine.position() });
  raf = requestAnimationFrame(tick);
}

export function loopRange(s: AppState = get()): { from: number; to: number } {
  const p = currentProject(s);
  const bt = barTicks(p.meter);
  if (s.selection.kind === 'drawing') {
    const id = s.selection.id;
    const pl = placeDrawings(p).find((x) => x.drawing.id === id);
    if (pl) return { from: pl.startTick, to: pl.endTick };
  }
  const win = viewWindow(s);
  return { from: win.start * bt, to: (win.start + win.bars) * bt };
}

export function play() {
  const s = get();
  const p = currentProject(s);
  const end = totalBars(p) * barTicks(p.meter);
  const loop = s.loop ? loopRange(s) : null;
  let from = s.playhead >= end - 1 ? 0 : s.playhead;
  if (loop && (from < loop.from || from >= loop.to)) from = loop.from;
  engine.setVolume(s.volume);
  engine.start(playEvents(p), { tempo: p.tempo, from, end, loop, onEnd: () => set({ playing: false, playhead: 0 }) });
  set({ playing: true });
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

export function stop() {
  engine.stop();
  cancelAnimationFrame(raf);
  set({ playing: false });
}

export function togglePlay() {
  if (get().playing) {
    stop();
  } else play();
}

export function stopAndReset() {
  stop();
  set({ playhead: loopRangeStart() });
}

function loopRangeStart() {
  const s = get();
  return s.loop ? loopRange(s).from : 0;
}

export function rewind() {
  const was = get().playing;
  stop();
  set({ playhead: loopRangeStart() });
  if (was) play();
}

export function toggleLoop() {
  const was = get().playing;
  set((s) => ({ loop: !s.loop }));
  if (was) {
    stop();
    play();
  }
}

export function toggleRecord() {
  const on = !get().recording;
  set({ recording: on });
  toast(on ? 'Step input on — play A W S E D F T G Y H U J K to enter notes at the playhead' : 'Step input off');
}

export function setVolume(v: number) {
  set({ volume: v });
  engine.setVolume(v);
}

export function seek(tick: number) {
  const was = get().playing;
  if (was) stop();
  set({ playhead: Math.max(0, tick) });
  if (was) play();
}

/** Step input: add a note at the playhead and advance. */
export function stepInput(semitoneFromC4: number) {
  const s = get();
  const p = currentProject(s);
  const pitch = 60 + semitoneFromC4;
  const end = totalBars(p) * barTicks(p.meter);
  const at = Math.round(s.playhead / T16) * T16;
  if (at >= end) {
    toast('End of period reached');
    return;
  }
  addNote(at, pitch, s.noteLength);
  set({ playhead: at + s.noteLength });
}

export function audition(notes: Note[], tempo?: number) {
  engine.audition(
    notes.map((n) => ({ pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel })),
    tempo ?? currentProject().tempo,
  );
}

export function fifthsOf(p: Project) {
  return keyFifths(p.key);
}

// ---------------------------------------------------------------------------
// Contour & gesture editing

/** Apply an arbitrary note function to one drawing. */
export function applyToDrawing(drawingId: string, fn: (notes: Note[], len: number, scale: ScaleRef) => Note[], transform?: TransformKind) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    d.notes = sorted(fn(d.notes, drawingLength(p, d), d.scale));
    if (transform) d.transform = transform;
  });
}

/**
 * Raise or lower a contour vertex by scale degrees while keeping the
 * drawing's internal relations: neighbouring notes follow with a weight that
 * fades to zero at the adjacent turning points.
 */
export function bendContour(drawingId: string, noteId: string, steps: number) {
  if (!steps) return;
  applyToDrawing(drawingId, (notes, _len, scale) => {
    const s = sorted(notes);
    const i = s.findIndex((n) => n.id === noteId);
    if (i < 0) return s;
    const turning = (k: number) => {
      if (k <= 0 || k >= s.length - 1) return true;
      const a = s[k - 1].pitch - s[k].pitch;
      const b = s[k + 1].pitch - s[k].pitch;
      return Math.sign(a) === Math.sign(b) && a !== 0;
    };
    let a = i - 1;
    while (a > 0 && !turning(a)) a--;
    let b = i + 1;
    while (b < s.length - 1 && !turning(b)) b++;
    a = Math.max(0, a);
    b = Math.min(s.length - 1, b);
    return s.map((n, k) => {
      if (k < a || k > b) return n;
      const w = k === i ? 1 : k < i ? (k - a) / Math.max(1, i - a) : (b - k) / Math.max(1, b - i);
      const shift = Math.round(steps * w);
      if (!shift) return n;
      return { ...n, pitch: transposeDiatonic([n], shift, scale)[0].pitch };
    });
  });
}

export function stretchPitch(drawingId: string, factor: number) {
  applyToDrawing(drawingId, (notes, _len, scale) => scalePitch(notes, factor, scale));
}
