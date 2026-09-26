import { create } from 'zustand';
import { engine } from '../audio/engine';
import type { PlayEvent } from '../audio/engine';
import { classifyContour } from '../model/analysis';
import type { RhythmCharacter, SymmetryKind } from '../model/analysis';
import { demoProject, motifLibrary, projectFromTemplate, recentProjects, stepsFor } from '../model/demo';
import type { TemplateId } from '../model/demo';
import { rerhythm, rhythmTemplate } from '../model/rhythmTemplates';
import {
  adjacentChord,
  clearRange,
  deleteTime,
  duplicate,
  duplicateOffset,
  glue,
  insertTime,
  paste,
  resizeStart,
  selectAlternate,
  selectInRange,
  selectSamePitch,
  setDurations,
  span,
  splitAt,
  toClip,
  toggleMute,
  toggleSlur,
  transpose,
  invertSelection,
} from '../model/editing';
import type { ChordKind, EditResult, Ids } from '../model/editing';
import { absoluteNotes, barTicks, deriveMembers, placeDrawings, scaleAtTick, totalBars, uid } from '../model/syntax';
import type { AbsNote } from '../model/syntax';
import { keyFifths, pitchForLetter, sameScale } from '../model/theory';
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
/** Piano-roll tools (FL Studio names: Draw, Paint, Select, Slice, Delete, Mute, Playback). */
export type RollTool = 'pointer' | 'draw' | 'paint' | 'select' | 'slice' | 'erase' | 'mute' | 'scrub';
/** Which editor receives the arrow keys: the staves (score-style) or the piano roll (DAW-style). */
export type FocusPane = 'staff' | 'roll';
export interface RollOpts {
  /** Note names on the notes. */
  names: boolean;
  /** Darken rows outside the drawing's scale. */
  scale: boolean;
  /** Velocity lane under the grid. */
  velocity: boolean;
  /** Colour notes by the drawing they belong to. */
  byDrawing: boolean;
  /** Show the lower voice as ghost notes. */
  ghosts: boolean;
}
export type NoteToolId = 'quantize' | 'randomize' | 'strum' | 'arpeggiate' | 'velocity' | 'limit' | 'transpose' | 'chop';
export type Modal =
  | null
  | { kind: 'variations'; drawingId: string }
  | { kind: 'new-project'; template: TemplateId }
  | { kind: 'shortcuts' }
  | { kind: 'note-props' }
  | { kind: 'note-tool'; tool: NoteToolId };

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
  modal: Modal;
  focusPane: FocusPane;
  rollTool: RollTool;
  stamp: ChordKind;
  rollOpts: RollOpts;
  /** Time selection from the ruler (also the loop range). */
  timeSel: { from: number; to: number } | null;
  /** Copied notes, rebased to tick 0. */
  clipboard: Note[] | null;
  /** Score-style note input (N): the caret and the notes entered last (for chords, ties, repeat). */
  noteInput: { caret: number; last: string[] } | null;
  /** Collapsed editor panels. */
  collapsed: Record<string, boolean>;
  past: Snapshot[];
  future: Snapshot[];
}

const STORAGE_KEY = 'phrasis.v1';
const PREFS_KEY = 'phrasis.prefs.v1';
const PREF_KEYS = ['rollTool', 'stamp', 'rollOpts', 'snap', 'noteLength', 'collapsed', 'scaleQuantize'] as const;
type Prefs = Partial<Pick<AppState, (typeof PREF_KEYS)[number]>>;

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

export const DEFAULT_ROLL_OPTS: RollOpts = { names: true, scale: true, velocity: true, byDrawing: false, ghosts: true };

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
  const prefs = loadPrefs();
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
    noteLength: prefs.noteLength ?? T8,
    snap: prefs.snap ?? T8,
    scaleQuantize: prefs.scaleQuantize ?? false,
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
    focusPane: 'roll',
    rollTool: prefs.rollTool ?? 'draw',
    stamp: prefs.stamp ?? 'none',
    rollOpts: { ...DEFAULT_ROLL_OPTS, ...prefs.rollOpts },
    timeSel: null,
    clipboard: null,
    noteInput: null,
    collapsed: prefs.collapsed ?? {},
    past: [],
    future: [],
  };
}

export const useApp = create<AppState>(() => initial());
const set = useApp.setState;
const get = useApp.getState;

// Editor preferences survive reloads.
useApp.subscribe((s, prev) => {
  if (!PREF_KEYS.some((k) => s[k] !== prev[k])) return;
  try {
    const prefs: Prefs = {};
    for (const k of PREF_KEYS) (prefs as Record<string, unknown>)[k] = s[k];
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
});

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
  if (s.noteInput) set({ noteInput: { ...s.noteInput, last: s.noteInput.last.filter((id) => ids.has(id)) } });
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
  try {
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  } catch {
    /* some embedded frames refuse history writes */
  }
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
    timeSel: null,
    noteInput: null,
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
  // The inspector follows the drawing that owns a clicked note.
  const s = get();
  if (ids.length && s.noteSel.length) {
    const owner = absoluteNotes(currentProject(s)).find((n) => n.id === ids[ids.length - 1])?.drawingId;
    if (owner && !(s.selection.kind === 'drawing' && s.selection.id === owner)) set({ selection: { kind: 'drawing', id: owner } });
  }
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

/** Route the keyboard to an editor; leaving the staves ends note input. */
export function focusPane(pane: FocusPane) {
  const s = get();
  if (s.focusPane !== pane) set({ focusPane: pane });
  if (pane === 'roll' && s.noteInput) set({ noteInput: null });
}

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
// Editing toolkit: whole-period edits in absolute time (piano roll + staves)

/** Every note of the period with an absolute `start`. */
export function periodNotes(p: Project = currentProject()): Note[] {
  return absoluteNotes(p).map(({ abs, drawingId: _d, ...n }) => {
    void _d;
    return { ...n, start: abs };
  });
}

export function periodEnd(p: Project = currentProject()): number {
  return totalBars(p) * barTicks(p.meter);
}

/** Scale of the drawing that contains a tick (what scale-degree edits use). */
export function drawingScaleAt(p: Project, tick: number): ScaleRef {
  const pl = placeDrawings(p).find((x) => tick >= x.startTick && tick < x.endTick) ?? placeDrawings(p).slice(-1)[0];
  return pl?.drawing.scale ?? p.key;
}

/** Apply an absolute-time edit to the period as one undoable step. */
export function editPeriod(fn: (notes: Note[]) => EditResult | Note[]) {
  let sel: string[] | undefined;
  let ids = new Set<string>();
  editNotes((abs) => {
    const r = fn(abs.map(({ abs: a, drawingId: _d, ...n }) => {
      void _d;
      return { ...n, start: a };
    }));
    const res = Array.isArray(r) ? { notes: r } : r;
    sel = res.sel;
    ids = new Set(res.notes.map((n) => n.id));
    return res.notes.map((n) => ({ ...n, abs: n.start }));
  });
  set((s) => ({ noteSel: sel ?? s.noteSel.filter((id) => ids.has(id)) }));
}

/** Notes an editing command applies to: the note selection, else the selected drawing. */
export function targetIds(s: AppState = get()): string[] {
  if (s.noteSel.length) return s.noteSel;
  return selectedDrawing(s)?.notes.map((n) => n.id) ?? [];
}

/** Run a note tool on the target notes. */
export function runTool(fn: (notes: Note[], ids: Ids) => EditResult, done?: string) {
  const ids = new Set(targetIds());
  if (!ids.size) {
    toast('Select some notes first');
    return;
  }
  editPeriod((notes) => fn(notes, ids));
  if (done) toast(done);
}

export const scaleAtFor = (p: Project) => (tick: number) => drawingScaleAt(p, tick);

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// --- clipboard

export function copyNotes(cut = false) {
  const s = get();
  const ids = new Set(s.noteSel);
  if (!ids.size) {
    toast('Nothing selected');
    return;
  }
  set({ clipboard: toClip(periodNotes(), ids) });
  if (cut) editPeriod((notes) => ({ notes: notes.filter((n) => !ids.has(n.id)), sel: [] }));
  toast(`${cut ? 'Cut' : 'Copied'} ${plural(ids.size, 'note')}`);
}

/** Paste at `at`, or at the time selection / playhead; the playhead moves past the pasted notes. */
export function pasteNotes(at?: number) {
  const s = get();
  const clip = s.clipboard;
  if (!clip?.length) {
    toast('The clipboard is empty — copy notes with ⌘C');
    return;
  }
  const p = currentProject(s);
  const tick = Math.max(0, Math.round(at ?? (s.timeSel ? s.timeSel.from : Math.floor(s.playhead / s.snap) * s.snap)));
  const fits = clip.filter((n) => n.start + tick < periodEnd(p)).length;
  if (!fits) {
    toast('Nothing to paste there — that is past the end of the period');
    return;
  }
  editPeriod((notes) => paste(notes, clip, tick, periodEnd(p)));
  if (fits < clip.length) toast(`Pasted ${plural(fits, 'note')} — ${clip.length - fits} fell past the end of the period`);
  const len = span(clip)?.to ?? 0;
  if (!s.playing) set({ playhead: Math.min(periodEnd(p), tick + len) });
  ensureVisible(tick);
}

/** Duplicate the selection right after itself (FL ⌘B, Sibelius R). */
export function duplicateNotes() {
  const s = get();
  const ids = new Set(s.noteSel);
  if (!ids.size) {
    toast('Select notes to duplicate');
    return;
  }
  const notes = periodNotes();
  const sel = notes.filter((n) => ids.has(n.id));
  const offset = s.timeSel && sel.every((n) => n.start >= s.timeSel!.from && n.start < s.timeSel!.to) ? s.timeSel.to - s.timeSel.from : duplicateOffset(sel, s.snap);
  if (Math.min(...sel.map((n) => n.start)) + offset >= periodEnd()) {
    toast('No room after the selection — add a drawing or bars to continue');
    return;
  }
  editPeriod((all) => duplicate(all, ids, offset, periodEnd()));
  if (s.timeSel) set({ timeSel: { from: s.timeSel.from + offset, to: s.timeSel.to + offset } });
  const first = Math.min(...sel.map((n) => n.start)) + offset;
  ensureVisible(first);
}

// --- selection

export function selectAllNotes() {
  set({ noteSel: periodNotes().map((n) => n.id) });
}

export function deselectNotes() {
  set({ noteSel: [] });
}

export function invertNoteSelection() {
  set((s) => ({ noteSel: invertSelection(periodNotes(), new Set(s.noteSel)) }));
}

export function selectSamePitchNotes() {
  set((s) => ({ noteSel: selectSamePitch(periodNotes(), new Set(targetIds(s))) }));
}

export function selectAlternateNotes(odd: boolean) {
  set((s) => ({ noteSel: selectAlternate(periodNotes(), new Set(targetIds(s)), odd) }));
}

export function selectTimeRange(from: number, to: number, additive = false) {
  selectNotes(selectInRange(periodNotes(), Math.min(from, to), Math.max(from, to)), additive);
}

/** Every note of one pitch (⌘-click a piano key). */
export function selectPitch(pitch: number, additive = false) {
  selectNotes(
    periodNotes()
      .filter((n) => n.pitch === pitch)
      .map((n) => n.id),
    additive,
  );
}

export function selectDrawingNotes(drawingId?: string) {
  const s = get();
  const id = drawingId ?? (s.selection.kind === 'drawing' ? s.selection.id : undefined);
  const d = currentProject(s).drawings.find((x) => x.id === id);
  if (d) set({ noteSel: d.notes.map((n) => n.id) });
}

/** Arrow-key navigation through the score: the next/previous chord (or bar with `byBar`). */
export function selectAdjacent(dir: 1 | -1, extend = false, byBar = false) {
  const s = get();
  const p = currentProject(s);
  const notes = periodNotes(p);
  const ids = new Set(s.noteSel);
  let next: Note[];
  if (byBar) {
    const bt = barTicks(p.meter);
    const sel = notes.filter((n) => ids.has(n.id));
    const ref = sel.length ? (dir > 0 ? Math.max(...sel.map((n) => n.start)) : Math.min(...sel.map((n) => n.start))) : viewWindow(s).start * bt;
    const bar = Math.floor(ref / bt) + dir;
    const inBar = notes.filter((n) => n.start >= bar * bt && n.start < (bar + 1) * bt);
    const first = inBar.length ? Math.min(...inBar.map((n) => n.start)) : -1;
    next = inBar.filter((n) => n.start === first);
  } else next = adjacentChord(notes, ids, dir, viewWindow(s).start * barTicks(p.meter));
  if (!next.length) return;
  set({ noteSel: extend ? Array.from(new Set([...s.noteSel, ...next.map((n) => n.id)])) : next.map((n) => n.id) });
  ensureVisible(next[0].start);
  audition(next.map((n) => ({ ...n, start: 0, dur: Math.min(n.dur, 600) })));
}

// --- note properties

export function setVelocities(map: Record<string, number>) {
  if (!Object.keys(map).length) return;
  editPeriod((notes) => notes.map((n) => (n.id in map ? { ...n, vel: Math.max(1, Math.min(127, Math.round(map[n.id]))) } : n)));
}

/** Patch properties of the given notes (inspector / note properties). */
export function patchNotes(ids: string[], patch: Partial<Pick<Note, 'vel' | 'art' | 'mute' | 'slur' | 'pitch' | 'start' | 'dur'>>) {
  const sel = new Set(ids);
  if (!sel.size) return;
  editPeriod((notes) =>
    notes.map((n) => {
      if (!sel.has(n.id)) return n;
      const out = { ...n, ...patch };
      if ('art' in patch && !patch.art) delete out.art;
      if ('mute' in patch && !patch.mute) delete out.mute;
      if ('slur' in patch && !patch.slur) delete out.slur;
      out.pitch = Math.max(21, Math.min(108, out.pitch));
      out.start = Math.max(0, out.start);
      out.dur = Math.max(T16 / 2, out.dur);
      return out;
    }),
  );
}

export function toggleMuteNotes(ids: string[] = get().noteSel) {
  if (!ids.length) return;
  editPeriod((notes) => toggleMute(notes, new Set(ids)));
}

export function toggleSlurNotes(ids: string[] = get().noteSel) {
  if (!ids.length) {
    toast('Select the notes to slur');
    return;
  }
  editPeriod((notes) => toggleSlur(notes, new Set(ids)));
}

/** Tie = glue repeated pitches in the selection into single notes. */
export function glueNotes(ids: string[] = get().noteSel) {
  if (ids.length < 2) {
    toast('Select two or more notes of the same pitch to tie them');
    return;
  }
  editPeriod((notes) => glue(notes, new Set(ids)));
}

export function sliceNotes(ids: string[], tick: number) {
  if (!ids.length) return;
  editPeriod((notes) => splitAt(notes, new Set(ids), tick));
}

export function resizeNotesStart(ids: string[], d: number) {
  if (!ids.length || !d) return;
  editPeriod((notes) => resizeStart(notes, new Set(ids), d));
}

/** Add several notes at once (paint tool, chord stamps); they become the selection. */
export function addNotesAbs(list: Array<{ start: number; pitch: number; dur: number; vel?: number }>) {
  if (!list.length) return;
  const end = periodEnd();
  const added: Note[] = list
    .filter((n) => n.start >= 0 && n.start < end)
    .map((n) => ({ id: uid('n'), pitch: Math.max(21, Math.min(108, n.pitch)), start: n.start, dur: Math.max(T16 / 2, n.dur), vel: n.vel ?? 86 }));
  editPeriod((notes) => ({ notes: [...notes, ...added], sel: added.map((n) => n.id) }));
  const first = Math.min(...added.map((n) => n.start));
  audition(added.filter((n) => n.start === first).map((n) => ({ ...n, start: 0, dur: Math.min(n.dur, TPQ) })));
}

/** Set written durations, notation-style (longer notes overwrite what follows). */
export function setNoteDurations(ids: string[], dur: number) {
  if (!ids.length) return;
  editPeriod((notes) => setDurations(notes, new Set(ids), dur));
}

export function transposeNotes(ids: string[], amount: number, mode: 'chromatic' | 'diatonic') {
  if (!ids.length || !amount) return;
  const p = currentProject();
  editPeriod((notes) => transpose(notes, new Set(ids), amount, mode, scaleAtFor(p)));
  const moved = periodNotes().filter((n) => ids.includes(n.id));
  const first = Math.min(...moved.map((n) => n.start));
  audition(moved.filter((n) => n.start === first).map((n) => ({ ...n, start: 0, dur: Math.min(n.dur, 400) })));
}

// --- time

export function setTimeSel(sel: { from: number; to: number } | null) {
  if (sel && Math.abs(sel.to - sel.from) < 1) sel = null;
  set({ timeSel: sel ? { from: Math.min(sel.from, sel.to), to: Math.max(sel.from, sel.to) } : null });
  if (get().playing && get().loop) {
    stop();
    play();
  }
}

/** Insert silence (the time selection's length, else one bar) at the time selection or playhead. */
export function insertSpace() {
  const s = get();
  const p = currentProject(s);
  const at = s.timeSel?.from ?? Math.floor(s.playhead / s.snap) * s.snap;
  const len = s.timeSel ? s.timeSel.to - s.timeSel.from : barTicks(p.meter);
  editPeriod((notes) => insertTime(notes, at, len, periodEnd(p)));
  toast('Inserted space — notes past the end of the period were dropped');
}

export function deleteSpace() {
  const s = get();
  const p = currentProject(s);
  const from = s.timeSel?.from ?? Math.floor(s.playhead / s.snap) * s.snap;
  const to = s.timeSel?.to ?? from + barTicks(p.meter);
  editPeriod((notes) => deleteTime(notes, from, to));
  set({ timeSel: null });
}

/** Scroll the time-aligned editors so that a tick is visible. */
export function ensureVisible(tick: number) {
  const s = get();
  const p = currentProject(s);
  const bt = barTicks(p.meter);
  const win = viewWindow(s);
  const bar = Math.floor(tick / bt);
  if (bar < win.start || bar >= win.start + win.bars) {
    const total = totalBars(p);
    set({ scrollBar: Math.max(0, Math.min(total - win.bars, bar - (bar < win.start ? win.bars - 1 : 0))) });
  }
}

// --- durations (shared by the note keypad and note input)

/** Plain note values in ticks, 32nd to whole. */
export const NOTE_VALUES = [T16 / 2, T16, T8, TPQ, TPQ * 2, TPQ * 4];

export function isDotted(dur: number): boolean {
  return NOTE_VALUES.includes((dur * 2) / 3);
}

export function baseValue(dur: number): number {
  return isDotted(dur) ? (dur * 2) / 3 : dur;
}

/**
 * Choose a note value (keypad / number keys). Outside note input, the staff's
 * selected notes take the new length too, as in a notation program.
 */
export function chooseDuration(value: number, applyToSelection = true) {
  const s = get();
  const dur = isDotted(s.noteLength) && NOTE_VALUES.includes(value) && value < TPQ * 4 ? value * 1.5 : value;
  set({ noteLength: dur });
  if (applyToSelection && !s.noteInput && s.noteSel.length) setNoteDurations(s.noteSel, dur);
}

export function toggleDot(applyToSelection = true) {
  const s = get();
  const dur = isDotted(s.noteLength) ? baseValue(s.noteLength) : s.noteLength < TPQ * 4 ? s.noteLength * 1.5 : s.noteLength;
  set({ noteLength: dur });
  if (applyToSelection && !s.noteInput && s.noteSel.length) setNoteDurations(s.noteSel, dur);
}

// --- score-style note input (N)

export function startNoteInput(at?: number) {
  const s = get();
  const p = currentProject(s);
  let caret = at;
  if (caret === undefined) {
    const sel = periodNotes(p).filter((n) => s.noteSel.includes(n.id));
    if (sel.length) caret = Math.max(...sel.map((n) => n.start + n.dur));
    else if (s.timeSel) caret = s.timeSel.from;
    else if (s.playhead > 0) caret = Math.round(s.playhead / T16) * T16;
    else caret = placeDrawings(p).find((x) => s.selection.kind === 'drawing' && x.drawing.id === s.selection.id)?.startTick ?? 0;
  }
  caret = Math.max(0, Math.min(periodEnd(p) - T16, caret));
  if (s.recording) set({ recording: false });
  set({ noteInput: { caret, last: [] }, focusPane: 'staff' });
  ensureVisible(caret);
}

export function stopNoteInput() {
  set({ noteInput: null });
}

export function toggleNoteInput() {
  if (get().noteInput) stopNoteInput();
  else {
    startNoteInput();
    toast('Note input: type A–G · 3–7 durations · . dot · 0 rest · Enter tie · Esc to finish');
  }
}

export function setCaret(tick: number) {
  const s = get();
  if (!s.noteInput) return;
  const caret = Math.max(0, Math.min(periodEnd(), Math.round(tick)));
  set({ noteInput: { caret, last: [] } });
  ensureVisible(caret);
}

function lastPitchBefore(notes: Note[], tick: number): number | undefined {
  let best: Note | undefined;
  for (const n of notes) if (n.start < tick && (!best || n.start > best.start || (n.start === best.start && n.pitch > best.pitch))) best = n;
  return best?.pitch;
}

/** Enter a note at the caret (or at `at`), overwriting what sounds there, and advance. */
export function inputPitch(pitch: number, at?: number) {
  const s = get();
  const p = currentProject(s);
  const caret = at ?? s.noteInput?.caret ?? 0;
  const end = periodEnd(p);
  if (caret >= end) {
    toast('End of the period — add a drawing to continue');
    return;
  }
  const dur = Math.min(s.noteLength, end - caret);
  const note: Note = { id: uid('n'), pitch: Math.max(21, Math.min(108, pitch)), start: caret, dur, vel: 86 };
  editPeriod((notes) => ({ notes: [...clearRange(notes, caret, caret + dur), note], sel: [note.id] }));
  set({ noteInput: { caret: Math.min(end, caret + dur), last: [note.id] } });
  ensureVisible(caret + dur);
  audition([{ ...note, start: 0, dur: Math.min(dur, TPQ) }]);
}

/** Type a letter name (0 = C … 6 = B); with `chord`, stack it above the last entered note. */
export function inputLetter(letter: number, chord = false) {
  const s = get();
  if (!s.noteInput) return;
  const p = currentProject(s);
  const notes = periodNotes(p);
  const last = notes.filter((n) => s.noteInput!.last.includes(n.id));
  if (chord && last.length) {
    const top = last.reduce((a, b) => (b.pitch > a.pitch ? b : a));
    addChordNote(top, pitchForLetter(letter, keyFifths(scaleAtTick(p, top.start)), top.pitch, true));
    return;
  }
  const caret = s.noteInput.caret;
  const near = lastPitchBefore(notes, caret) ?? 71;
  inputPitch(pitchForLetter(letter, keyFifths(scaleAtTick(p, caret)), near));
}

/** Add an interval above the last entered note (2 = second … 8 = octave). */
export function inputInterval(interval: number) {
  const s = get();
  if (!s.noteInput) return;
  const p = currentProject(s);
  const last = periodNotes(p).filter((n) => s.noteInput!.last.includes(n.id));
  if (!last.length) return;
  const top = last.reduce((a, b) => (b.pitch > a.pitch ? b : a));
  const moved = transposeDiatonic([top], interval - 1, drawingScaleAt(p, top.start))[0].pitch;
  addChordNote(top, moved);
}

function addChordNote(base: Note, pitch: number) {
  const s = get();
  const note: Note = { id: uid('n'), pitch, start: base.start, dur: base.dur, vel: base.vel };
  editPeriod((notes) => ({ notes: [...notes, note], sel: [...(s.noteInput?.last ?? []), note.id] }));
  set({ noteInput: { caret: s.noteInput?.caret ?? base.start + base.dur, last: [...(s.noteInput?.last ?? []), note.id] } });
  audition([{ ...note, start: 0, dur: Math.min(note.dur, TPQ) }]);
}

/** A rest of the current value: clear what sounds there and advance. */
export function inputRest() {
  const s = get();
  if (!s.noteInput) return;
  const end = periodEnd();
  const caret = s.noteInput.caret;
  const dur = Math.min(s.noteLength, end - caret);
  if (dur <= 0) {
    toast('End of the period — add a drawing to continue');
    return;
  }
  editPeriod((notes) => ({ notes: clearRange(notes, caret, caret + dur), sel: [] }));
  set({ noteInput: { caret: Math.min(end, caret + dur), last: [] } });
}

/** Tie: lengthen the last entered note(s) by the current value. */
export function inputTie() {
  const s = get();
  if (!s.noteInput) return;
  const ids = new Set(s.noteInput.last);
  const caret = s.noteInput.caret;
  const last = periodNotes().filter((n) => ids.has(n.id));
  if (!last.length || last.some((n) => n.start + n.dur !== caret)) {
    toast('Enter a note first — Enter ties it to a note of the current value');
    return;
  }
  const end = periodEnd();
  const add = Math.min(s.noteLength, end - caret);
  if (add <= 0) {
    toast('End of the period — nothing left to tie into');
    return;
  }
  editPeriod((notes) => clearRange(notes, caret, caret + add, ids).map((n) => (ids.has(n.id) ? { ...n, dur: n.dur + add } : n)));
  set({ noteInput: { caret: Math.min(end, caret + add), last: [...ids] } });
}

/** Delete the note before the caret and step back. */
export function inputBackspace() {
  const s = get();
  if (!s.noteInput) return;
  const caret = s.noteInput.caret;
  const before = periodNotes().filter((n) => n.start < caret);
  if (!before.length) return;
  const at = Math.max(...before.map((n) => n.start));
  const gone = new Set(before.filter((n) => n.start === at).map((n) => n.id));
  editPeriod((notes) => ({ notes: notes.filter((n) => !gone.has(n.id)), sel: [] }));
  set({ noteInput: { caret: at, last: [] } });
}

/** Repeat the last entered note or chord at the caret (Sibelius R). */
export function inputRepeat() {
  const s = get();
  if (!s.noteInput) return;
  const last = periodNotes().filter((n) => s.noteInput!.last.includes(n.id));
  if (!last.length) return;
  const caret = s.noteInput.caret;
  const end = periodEnd();
  const dur = Math.min(Math.max(...last.map((n) => n.dur)), end - caret);
  if (dur <= 0) return;
  const copies = last.map((n) => ({ ...n, id: uid('n'), start: caret, dur, slur: undefined }));
  editPeriod((notes) => ({ notes: [...clearRange(notes, caret, caret + dur), ...copies], sel: copies.map((n) => n.id) }));
  set({ noteInput: { caret: Math.min(end, caret + dur), last: copies.map((n) => n.id) } });
  audition(copies.map((n) => ({ ...n, start: 0, dur: Math.min(n.dur, TPQ) })));
}

/** Move the caret to the previous/next onset (or bar with `byBar`). */
export function moveCaret(dir: 1 | -1, byBar = false) {
  const s = get();
  if (!s.noteInput) return;
  const p = currentProject(s);
  const caret = s.noteInput.caret;
  let next: number;
  if (byBar) {
    const bt = barTicks(p.meter);
    next = dir > 0 ? (Math.floor(caret / bt) + 1) * bt : Math.ceil(caret / bt - 1) * bt;
  } else {
    const onsets = Array.from(new Set(periodNotes(p).flatMap((n) => [n.start, n.start + n.dur]))).sort((a, b) => a - b);
    const found = dir > 0 ? onsets.find((t) => t > caret) : [...onsets].reverse().find((t) => t < caret);
    next = found ?? caret + dir * s.noteLength;
  }
  setCaret(next);
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

/** Keep the modulation map covering the whole period after its length changes. */
function fitRegions(p: Project, oldTotal: number) {
  const total = totalBars(p);
  if (total === oldTotal) return;
  p.regions = p.regions.filter((r) => r.start < total);
  if (!p.regions.length) p.regions = [{ id: uid('r'), start: 0, end: total, scale: p.key }];
  for (const r of p.regions) if (r.end >= oldTotal || r.end > total) r.end = total;
}

export function setDrawingBars(drawingId: string, bars: number) {
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d || d.bars === bars) return;
    const old = totalBars(p);
    d.notes = scaleTime(d.notes, bars / d.bars);
    d.bars = bars;
    fitRegions(p, old);
  });
}

/** Lengthen or shorten a drawing without changing its rhythm (bars are added or cut at the end). */
export function resizeDrawing(drawingId: string, bars: number) {
  const b = Math.max(1, Math.min(32, Math.round(bars)));
  editProject((p) => {
    const d = p.drawings.find((x) => x.id === drawingId);
    if (!d || d.bars === b) return;
    const old = totalBars(p);
    const len = b * barTicks(p.meter);
    d.notes = d.notes.filter((n) => n.start < len).map((n) => ({ ...n, dur: Math.min(n.dur, len - n.start) }));
    d.bars = b;
    fitRegions(p, old);
    p.steps = stepsFor(p);
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
    const old = totalBars(draft);
    const idx = after ? draft.drawings.findIndex((x) => x.id === after.id) + 1 : draft.drawings.length;
    draft.drawings.splice(idx, 0, d);
    fitRegions(draft, old);
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
    const old = totalBars(draft);
    draft.drawings.push(d);
    fitRegions(draft, old);
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
    const old = totalBars(draft);
    draft.drawings = draft.drawings.filter((d) => d.id !== id);
    fitRegions(draft, old);
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
    const bars = totalBars(draft);
    for (const r of draft.regions) r.end = Math.min(r.end, bars);
    draft.regions = draft.regions.filter((r) => r.start < bars);
    if (draft.regions.length) draft.regions[draft.regions.length - 1].end = bars;
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
  set({ projects, library: motifLibrary(), archived: [], past: [], future: [], clipboard: null });
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
  const ev: PlayEvent[] = absoluteNotes(p)
    .filter((n) => !n.mute)
    .map((n) => ({ pitch: n.pitch, start: n.abs, dur: n.art === 'staccato' ? n.dur * 0.5 : n.dur, vel: n.vel }));
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
  if (s.timeSel && s.timeSel.to > s.timeSel.from) return s.timeSel;
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
