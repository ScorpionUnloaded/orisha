/**
 * Editing toolbars and menus shared by the Composer's editors:
 *  - the piano-roll toolbar (FL Studio tools, snap, note length, chord stamp),
 *  - the note keypad over the melodic staff (Sibelius-style note input),
 *  - menu builders reused by panel menus and right-click menus.
 */
import type { ReactNode } from 'react';
import { CHORDS, chop, flipPitch, flipTime, glue, legato, quantizeNotes, snapPitches } from '../model/editing';
import type { ChordKind } from '../model/editing';
import { barTicks, beatTicks } from '../model/syntax';
import { T16, T8, TPQ } from '../model/types';
import type { Meter } from '../model/types';
import { G } from '../notation/glyphs';
import {
  NOTE_VALUES,
  baseValue,
  chooseDuration,
  copyNotes,
  currentProject,
  deleteNotes,
  deleteSpace,
  deselectNotes,
  duplicateNotes,
  glueNotes,
  inputRest,
  inputTie,
  insertSpace,
  invertNoteSelection,
  isDotted,
  pasteNotes,
  runTool,
  scaleAtFor,
  selectAllNotes,
  selectAlternateNotes,
  selectDrawingNotes,
  selectSamePitchNotes,
  setArticulation,
  setUi,
  toggleDot,
  toggleMuteNotes,
  toggleNoteInput,
  toggleSlurNotes,
  transposeNotes,
  useApp,
} from '../store/store';
import type { NoteToolId, RollOpts, RollTool } from '../store/store';
import { MenuButton, Select, ToolButton } from './ui/Controls';
import type { MenuItem } from './ui/Controls';
import { Brush, Chord, Eraser, FitIcon, Knife, Marquee, MuteNote, Pencil, Speaker, Wrench } from './ui/Icons';

const S = () => useApp.getState();

// ---------------------------------------------------------------------------
// Value labels

export function snapOptions(meter: Meter): Array<{ value: number; label: string }> {
  const beat = beatTicks(meter);
  const opts = [
    { value: barTicks(meter), label: 'Bar' },
    { value: beat, label: `Beat${beat === TPQ ? ' (1/4)' : beat === T8 ? ' (1/8)' : ''}` },
    { value: T8, label: '1/8' },
    { value: T16, label: '1/16' },
    { value: T16 / 2, label: '1/32' },
    { value: (TPQ * 2) / 3, label: '1/4 triplet' },
    { value: TPQ / 3, label: '1/8 triplet' },
    { value: TPQ / 6, label: '1/16 triplet' },
    { value: 1, label: 'None' },
  ];
  return opts.filter((o, i) => opts.findIndex((x) => x.value === o.value) === i);
}

export function snapLabel(snap: number, meter: Meter): string {
  const o = snapOptions(meter).find((x) => x.value === snap);
  return o ? o.label.replace(/ \(.*\)/, '') : `${snap} ticks`;
}

export const LENGTHS: Array<{ value: number; label: string }> = [
  { value: T16 / 2, label: '1/32' },
  { value: T16, label: '1/16' },
  { value: T8, label: '1/8' },
  { value: T8 * 1.5, label: '1/8 dotted' },
  { value: TPQ, label: '1/4' },
  { value: TPQ * 1.5, label: '1/4 dotted' },
  { value: TPQ * 2, label: '1/2' },
  { value: TPQ * 3, label: '1/2 dotted' },
  { value: TPQ * 4, label: 'Whole' },
];

export function lengthLabel(dur: number): string {
  return LENGTHS.find((l) => l.value === dur)?.label ?? `${Math.round((dur / TPQ) * 100) / 100} beats`;
}

// ---------------------------------------------------------------------------
// Menus

export function clipboardItems(at?: number): MenuItem[] {
  const s = S();
  const has = s.noteSel.length > 0;
  return [
    { label: 'Cut', hint: '⌘X', disabled: !has, onSelect: () => copyNotes(true) },
    { label: 'Copy', hint: '⌘C', disabled: !has, onSelect: () => copyNotes() },
    { label: at === undefined ? 'Paste' : 'Paste here', hint: '⌘V', disabled: !s.clipboard?.length, onSelect: () => pasteNotes(at) },
    { label: 'Duplicate', hint: '⌘B', disabled: !has, onSelect: duplicateNotes },
    { label: 'Delete', hint: '⌫', disabled: !has, onSelect: () => deleteNotes(S().noteSel) },
  ];
}

export function selectItems(): MenuItem[] {
  const has = S().noteSel.length > 0;
  return [
    { title: 'Select' },
    { label: 'Select all', hint: '⌘A', onSelect: selectAllNotes },
    { label: 'Deselect', hint: 'Esc', disabled: !has, onSelect: deselectNotes },
    { label: 'Invert selection', hint: '⇧⌘I', onSelect: invertNoteSelection },
    { label: 'Notes of the selected drawing', onSelect: () => selectDrawingNotes() },
    { label: 'Same pitch as selection', disabled: !has, onSelect: selectSamePitchNotes },
    { label: 'Odd onsets (1st, 3rd…)', disabled: !has, onSelect: () => selectAlternateNotes(true) },
    { label: 'Even onsets (2nd, 4th…)', disabled: !has, onSelect: () => selectAlternateNotes(false) },
  ];
}

const openTool = (tool: NoteToolId) => setUi({ modal: { kind: 'note-tool', tool } });

export function noteToolItems(): MenuItem[] {
  const s = S();
  const p = currentProject(s);
  const snap = snapLabel(s.snap, p.meter);
  const grid = Math.max(T16 / 2, s.snap);
  return [
    { title: 'Timing' },
    { label: `Quantize to ${snap}`, hint: 'Q', onSelect: () => runTool((n, ids) => quantizeNotes(n, ids, grid, { ends: true }), `Quantized to ${snap}`) },
    { label: 'Quantize start times only', hint: '⇧Q', onSelect: () => runTool((n, ids) => quantizeNotes(n, ids, grid), `Start times quantized to ${snap}`) },
    { label: 'Quantize…', onSelect: () => openTool('quantize') },
    { label: 'Legato', hint: 'L', onSelect: () => runTool(legato, 'Legato') },
    { label: 'Glue (tie repeated notes)', hint: 'G', onSelect: () => runTool(glue, 'Glued') },
    { label: `Chop into ${snapLabel(grid, p.meter)}`, hint: 'U', onSelect: () => runTool((n, ids) => chop(n, ids, grid), 'Chopped') },
    { label: 'Strum…', onSelect: () => openTool('strum') },
    { label: 'Arpeggiate…', onSelect: () => openTool('arpeggiate') },
    { label: 'Flip horizontally (retrograde)', onSelect: () => runTool(flipTime, 'Flipped in time') },
    { title: 'Pitch & velocity' },
    { label: 'Transpose…', onSelect: () => openTool('transpose') },
    { label: 'Flip vertically (mirror in key)', onSelect: () => runTool((n, ids) => flipPitch(n, ids, scaleAtFor(p)(n.find((x) => ids.has(x.id))?.start ?? 0)), 'Flipped in pitch') },
    { label: 'Snap pitches to scale', onSelect: () => runTool((n, ids) => snapPitches(n, ids, scaleAtFor(p)), 'Pitches snapped to the scale') },
    { label: 'Limit to range…', onSelect: () => openTool('limit') },
    { label: 'Velocity…', onSelect: () => openTool('velocity') },
    { label: 'Randomize / humanize…', onSelect: () => openTool('randomize') },
    { title: 'Time' },
    { label: 'Insert space', hint: s.timeSel ? 'selection' : '1 bar', onSelect: insertSpace },
    { label: 'Delete space', hint: s.timeSel ? 'selection' : '1 bar', onSelect: deleteSpace },
  ];
}

export function markItems(): MenuItem[] {
  const s = S();
  const has = s.noteSel.length > 0;
  return [
    { title: 'Marks' },
    { label: 'Accent', hint: '>', disabled: !has, onSelect: () => setArticulation(S().noteSel, 'accent') },
    { label: 'Staccato', hint: '.', disabled: !has, onSelect: () => setArticulation(S().noteSel, 'staccato') },
    { label: 'Tenuto', hint: '_', disabled: !has, onSelect: () => setArticulation(S().noteSel, 'tenuto') },
    { label: 'Slur', hint: 'S', disabled: !has, onSelect: () => toggleSlurNotes() },
    { label: 'Tie (glue)', hint: '↵', disabled: s.noteSel.length < 2, onSelect: () => glueNotes() },
    { label: 'Mute / unmute', disabled: !has, onSelect: () => toggleMuteNotes() },
  ];
}

export function transposeItems(diatonicFirst = true): MenuItem[] {
  const has = S().noteSel.length > 0;
  const t = (a: number, m: 'chromatic' | 'diatonic') => () => transposeNotes(S().noteSel, a, m);
  const items: MenuItem[] = [
    { label: 'Up a scale step', hint: diatonicFirst ? '↑' : '', disabled: !has, onSelect: t(1, 'diatonic') },
    { label: 'Down a scale step', hint: diatonicFirst ? '↓' : '', disabled: !has, onSelect: t(-1, 'diatonic') },
    { label: 'Up a semitone', hint: diatonicFirst ? '=' : '↑', disabled: !has, onSelect: t(1, 'chromatic') },
    { label: 'Down a semitone', hint: diatonicFirst ? '−' : '↓', disabled: !has, onSelect: t(-1, 'chromatic') },
    { label: 'Up an octave', hint: '⌘↑', disabled: !has, onSelect: t(12, 'chromatic') },
    { label: 'Down an octave', hint: '⌘↓', disabled: !has, onSelect: t(-12, 'chromatic') },
  ];
  return [{ title: 'Transpose' }, ...items];
}

export function rollViewItems(opts: RollOpts): MenuItem[] {
  const toggle = (k: keyof RollOpts) => () => setUi({ rollOpts: { ...S().rollOpts, [k]: !S().rollOpts[k] } });
  return [
    { title: 'View' },
    { label: 'Note names', checked: opts.names, onSelect: toggle('names') },
    { label: 'Scale highlighting', checked: opts.scale, onSelect: toggle('scale') },
    { label: 'Velocity lane', checked: opts.velocity, onSelect: toggle('velocity') },
    { label: 'Colour notes by drawing', checked: opts.byDrawing, onSelect: toggle('byDrawing') },
    { label: 'Ghost notes (lower voice)', checked: opts.ghosts, onSelect: toggle('ghosts') },
  ];
}

// ---------------------------------------------------------------------------
// Piano-roll toolbar

const ROLL_TOOLS: Array<{ id: RollTool; key: string; label: string; help: string; icon: ReactNode }> = [
  { id: 'draw', key: 'P', label: 'Draw', help: 'click to add, drag to place · drag edges to resize · ⌘-drag selects', icon: <Pencil size={17} /> },
  { id: 'paint', key: 'B', label: 'Paint', help: 'drag to paint a run of notes', icon: <Brush size={17} /> },
  { id: 'select', key: 'E', label: 'Select', help: 'drag a box to select · drag notes to move', icon: <Marquee size={16} /> },
  { id: 'slice', key: 'C', label: 'Slice', help: 'drag across notes to cut them', icon: <Knife size={17} /> },
  { id: 'erase', key: 'D', label: 'Delete', help: 'click or sweep to delete', icon: <Eraser size={17} /> },
  { id: 'mute', key: 'T', label: 'Mute', help: 'click or sweep to mute / unmute', icon: <MuteNote size={17} /> },
  { id: 'scrub', key: 'Y', label: 'Playback', help: 'drag to scrub and hear the notes', icon: <Speaker size={17} /> },
];

export function rollToolHelp(tool: RollTool): string {
  const t = ROLL_TOOLS.find((x) => x.id === tool);
  return t ? `${t.label} (${t.key}): ${t.help}` : '';
}

export const ROLL_TOOL_KEYS: Record<string, RollTool> = Object.fromEntries(ROLL_TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

export function RollToolbar({ onFit }: { onFit: () => void }) {
  const tool = useApp((s) => s.rollTool);
  const snap = useApp((s) => s.snap);
  const noteLength = useApp((s) => s.noteLength);
  const stamp = useApp((s) => s.stamp);
  const scaleQ = useApp((s) => s.scaleQuantize);
  const meter = useApp((s) => currentProject(s).meter);
  const lengths = LENGTHS.some((l) => l.value === noteLength) ? LENGTHS : [...LENGTHS, { value: noteLength, label: lengthLabel(noteLength) }];
  return (
    <div className="edit-bar" role="toolbar" aria-label="Piano roll tools">
      <div className="tgroup">
        {ROLL_TOOLS.map((t) => (
          <ToolButton key={t.id} on={tool === t.id} onClick={() => setUi({ rollTool: t.id, focusPane: 'roll' })} title={`${t.label} (${t.key}) — ${t.help}`}>
            {t.icon}
          </ToolButton>
        ))}
      </div>
      <span className="tb-mini">Snap</span>
      <Select size="sm" value={snap} options={snapOptions(meter)} onChange={(v) => setUi({ snap: v })} style={{ width: 92 }} ariaLabel="Snap" />
      <span className="tb-mini opt">Length</span>
      <Select size="sm" className="opt" value={noteLength} options={lengths} onChange={(v) => setUi({ noteLength: v })} style={{ width: 96 }} ariaLabel="Note length" />
      <Select<ChordKind>
        size="sm"
        className="opt2"
        value={stamp}
        options={(Object.keys(CHORDS) as ChordKind[]).map((c) => ({ value: c, label: CHORDS[c].label }))}
        onChange={(v) => setUi({ stamp: v })}
        display={
          <span className="with-icon">
            <Chord size={14} />
            {stamp === 'none' ? 'Chord' : CHORDS[stamp].label}
          </span>
        }
        style={{ width: 118 }}
        ariaLabel="Chord stamp"
      />
      <ToolButton on={scaleQ} onClick={() => setUi({ scaleQuantize: !scaleQ })} title="Snap pitches to the drawing's scale (↑/↓ then move by scale degree)" className="text">
        In key
      </ToolButton>
      <ToolButton onClick={onFit} title="Zoom the keyboard to fit the notes" className="opt2">
        <FitIcon size={16} />
      </ToolButton>
      <MenuButton items={noteToolItems()} label="Piano roll tools" title="Tools (quantize, legato, glue, chop, strum, arpeggiate…)" icon={<Wrench size={17} />} className="tbtn" align="right" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Note keypad (staff)

function Glyph({ ch, dy = 0, size = 20 }: { ch: string; dy?: number; size?: number }) {
  return (
    <svg width={22} height={26} viewBox="0 0 22 26" aria-hidden>
      <text x={11} y={13 + dy} fontSize={size} textAnchor="middle" className="smufl">
        {ch}
      </text>
    </svg>
  );
}

const VALUE_GLYPHS: Array<{ value: number; ch: string; label: string; key: string }> = [
  { value: T16, ch: '', label: 'Sixteenth', key: '3' },
  { value: T8, ch: '', label: 'Eighth', key: '4' },
  { value: TPQ, ch: '', label: 'Quarter', key: '5' },
  { value: TPQ * 2, ch: '', label: 'Half', key: '6' },
  { value: TPQ * 4, ch: '', label: 'Whole', key: '7' },
];

export function StaffKeypad() {
  const noteLength = useApp((s) => s.noteLength);
  const input = useApp((s) => s.noteInput);
  const hasSel = useApp((s) => s.noteSel.length > 0);
  const base = baseValue(noteLength);
  const dotted = isDotted(noteLength);
  const sel = () => S().noteSel;
  return (
    <div className="edit-bar keypad" role="toolbar" aria-label="Note keypad">
      <ToolButton on={!!input} onClick={toggleNoteInput} title="Note input (N) — type A–G at the caret, or click on the staff" className="text strong">
        {input ? 'Input ●' : 'N  Input'}
      </ToolButton>
      <div className="tgroup">
        {VALUE_GLYPHS.map((v) => (
          <ToolButton key={v.value} on={base === v.value && NOTE_VALUES.includes(base)} onClick={() => chooseDuration(v.value)} title={`${v.label} (${v.key})${hasSel && !input ? ' — also sets the selected notes' : ''}`} className="glyph">
            <Glyph ch={v.ch} dy={v.value === TPQ * 4 ? 0 : 7} />
          </ToolButton>
        ))}
        <ToolButton on={dotted} onClick={() => toggleDot()} title="Dot (. in note input)" className="glyph">
          <Glyph ch={G.dot} dy={1} size={26} />
        </ToolButton>
      </div>
      <div className="tgroup opt">
        <ToolButton onClick={() => (input ? inputRest() : hasSel && deleteNotes(sel()))} title={input ? 'Rest (0)' : 'Turn the selection into rests (0)'} className="glyph">
          <Glyph ch={G.restQuarter} dy={1} />
        </ToolButton>
        <ToolButton onClick={() => (input ? inputTie() : glueNotes())} title={input ? 'Tie the last note (Enter)' : 'Tie / glue selected notes of the same pitch (Enter)'} className="glyph">
          <svg width={22} height={26} viewBox="0 0 22 26" aria-hidden>
            <path d="M3 13c3 5 13 5 16 0-3 3.4-13 3.4-16 0z" className="fill" />
          </svg>
        </ToolButton>
        <ToolButton onClick={() => transposeNotes(sel(), -1, 'chromatic')} disabled={!hasSel} title="Flat — down a semitone (−)" className="glyph">
          <Glyph ch={G.flat} dy={3} />
        </ToolButton>
        <ToolButton onClick={() => transposeNotes(sel(), 1, 'chromatic')} disabled={!hasSel} title="Sharp — up a semitone (=)" className="glyph">
          <Glyph ch={G.sharp} dy={1} />
        </ToolButton>
      </div>
      <div className="tgroup opt2">
        <ToolButton onClick={() => setArticulation(sel(), 'accent')} disabled={!hasSel} title="Accent (>)" className="glyph">
          <Glyph ch={G.accentAbove} dy={4} />
        </ToolButton>
        <ToolButton onClick={() => setArticulation(sel(), 'staccato')} disabled={!hasSel} title="Staccato (.)" className="glyph">
          <Glyph ch={G.staccatoAbove} dy={3} />
        </ToolButton>
        <ToolButton onClick={() => setArticulation(sel(), 'tenuto')} disabled={!hasSel} title="Tenuto (_)" className="glyph">
          <Glyph ch={G.tenutoAbove} dy={3} />
        </ToolButton>
        <ToolButton onClick={() => toggleSlurNotes()} disabled={!hasSel} title="Slur over the selection (S)" className="glyph">
          <svg width={22} height={26} viewBox="0 0 22 26" aria-hidden>
            <path d="M2 17C5 8 17 8 20 17 17 10.4 5 10.4 2 17z" className="fill" />
          </svg>
        </ToolButton>
      </div>
    </div>
  );
}
