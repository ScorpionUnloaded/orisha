/**
 * An editable staff, Sibelius-style: click, ⇧-click (range) and ⌘-click
 * selection, box selection, click a bar to select it, drag noteheads up and
 * down by staff positions, ⌥-click to paste, double-click for note
 * properties, and — in note input (N) — a caret, a shadow note under the
 * pointer and click-to-enter.
 */
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react';
import { barTicks, scaleAtTick } from '../model/syntax';
import { keyFifths, prettyPitch } from '../model/theory';
import { transposeDiatonic } from '../model/transforms';
import { T16, TPQ } from '../model/types';
import type { Note, Project } from '../model/types';
import { G, M } from '../notation/glyphs';
import { pitchAtStaffPos, tickAtX } from '../notation/layout';
import type { EngraveOptions, Engraved, StaffGeometry, XMap } from '../notation/layout';
import { renderPrims, useEngraving } from '../notation/Staff';
import {
  NOTE_VALUES,
  audition,
  deselectNotes,
  drawingScaleAt,
  inputPitch,
  isDotted,
  pasteNotes,
  periodNotes,
  selectNotes,
  selectTimeRange,
  setCaret,
  setTimeSel,
  setUi,
  transposeNotes,
  useApp,
} from '../store/store';
import type { Axis } from './Timeline';

export interface StaffNote extends Note {
  abs: number;
  drawingId: string;
}

interface Props {
  project: Project;
  notes: StaffNote[];
  opts: EngraveOptions;
  geo: StaffGeometry;
  axis: Axis;
  spacing: 'axis' | 'barwise';
  classOf?: (id: string | undefined) => string | undefined;
  /** Pitch editing: dragging noteheads, the note-input caret and mouse input. */
  pitched?: boolean;
  before?: ReactNode;
  after?: ReactNode;
  overlay?: (eng: Engraved & { map: XMap }) => ReactNode;
  onContextMenu?: (client: { x: number; y: number }, tick: number) => void;
  onBackgroundDoubleClick?: () => void;
}

type Drag =
  | { kind: 'pitch'; ids: string[]; hit: StaffNote; y0: number; steps: number; moved: boolean }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean };

export function StaffEditor(props: Props) {
  const { project, notes, geo, axis } = props;
  const sp = geo.sp;
  const eng = useEngraving(notes, props.opts, geo, axis.xOf, props.classOf, props.spacing);
  const noteSel = useApp((s) => s.noteSel);
  const input = useApp((s) => (props.pitched ? s.noteInput : null));
  const snap = useApp((s) => s.snap);
  const noteLength = useApp((s) => s.noteLength);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ tick: number; pos: number } | null>(null);
  const lastDown = useRef<{ id: string; t: number } | null>(null);
  const sel = new Set(noteSel);
  const bt = barTicks(project.meter);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const yOfPos = (pos: number) => eng.top + (8 - pos) * (sp / 2);
  const posAt = (y: number) => Math.round(8 - (y - eng.top) / (sp / 2));
  const tickAt = (x: number) => tickAtX(eng.map, axis.startTick, axis.endTick, x);
  const grid = Math.max(T16, Math.round(snap / T16) * T16);
  const snapTick = (t: number) => Math.max(axis.startTick, Math.min(axis.endTick - T16, Math.round(t / grid) * grid));
  const pitchAt = (pos: number, tick: number) => pitchAtStaffPos(pos, props.opts.clef, keyFifths(scaleAtTick(project, tick)));
  const inStaff = (y: number) => y >= eng.top - sp * 0.75 && y <= eng.top + 4 * sp + sp * 0.75;
  const inBand = (y: number) => y >= eng.top - 4 * sp && y <= eng.top + 8 * sp;
  const say = (n: Note, pitch = n.pitch) => audition([{ ...n, pitch, start: 0, dur: Math.min(n.dur, 600) }]);

  const onNoteDown = (id: string, e: ReactPointerEvent) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    if (e.button === 2) {
      if (!sel.has(id)) selectNotes([id]);
      return;
    }
    if (e.button !== 0) return;
    const now = performance.now();
    if (lastDown.current?.id === id && now - lastDown.current.t < 380) {
      lastDown.current = null;
      selectNotes([id]);
      setUi({ modal: { kind: 'note-props' } });
      return;
    }
    lastDown.current = { id, t: now };
    if (input) {
      selectNotes([id]);
      setCaret(n.abs + n.dur);
      say(n);
      return;
    }
    let ids: string[];
    if (e.metaKey || e.ctrlKey) {
      ids = sel.has(id) ? noteSel.filter((x) => x !== id) : [...noteSel, id];
      selectNotes(ids);
      if (sel.has(id)) return;
    } else if (e.shiftKey && noteSel.length) {
      // Range (passage) selection from the current selection to the clicked note.
      const all = periodNotes(project);
      const cur = all.filter((x) => sel.has(x.id));
      const a = Math.min(n.abs, ...cur.map((x) => x.start));
      const b = Math.max(n.abs, ...cur.map((x) => x.start));
      ids = all.filter((x) => x.start >= a && x.start <= b).map((x) => x.id);
      selectNotes(ids);
    } else {
      ids = sel.has(id) ? noteSel : [id];
      if (!sel.has(id)) selectNotes([id]);
    }
    say(n);
    if (NOTE_VALUES.includes(n.dur) || isDotted(n.dur)) setUi({ noteLength: n.dur });
    if (props.pitched) {
      svgRef.current?.setPointerCapture(e.pointerId);
      setDrag({ kind: 'pitch', ids, hit: n, y0: local(e).y, steps: 0, moved: false });
    }
  };

  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const p = local(e);
    if (input) {
      const t = snapTick(tickAt(p.x));
      if (inBand(p.y)) inputPitch(pitchAt(posAt(p.y), t), t);
      else setCaret(t);
      return;
    }
    if (e.altKey && useApp.getState().clipboard?.length) {
      pasteNotes(snapTick(tickAt(p.x)));
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.shiftKey });
  };

  const onMove = (e: ReactPointerEvent) => {
    const p = local(e);
    if (drag?.kind === 'pitch') {
      const steps = Math.round((drag.y0 - p.y) / (sp / 2));
      const moved = drag.moved || Math.abs(p.y - drag.y0) > 3;
      if (steps !== drag.steps && moved) say(drag.hit, transposeDiatonic([drag.hit], steps, drawingScaleAt(project, drag.hit.abs))[0].pitch);
      if (steps !== drag.steps || moved !== drag.moved) setDrag({ ...drag, steps: moved ? steps : 0, moved });
      return;
    }
    if (drag?.kind === 'marquee') {
      setDrag({ ...drag, x1: p.x, y1: p.y });
      return;
    }
    if (input && inBand(p.y) && p.x >= axis.x0 - 4) {
      const tick = snapTick(tickAt(p.x));
      const pos = posAt(p.y);
      if (!hover || hover.tick !== tick || hover.pos !== pos) setHover({ tick, pos });
    } else if (hover) setHover(null);
  };

  const onUp = (e: ReactPointerEvent) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === 'pitch') {
      if (d.moved) lastDown.current = null; // a drag is not the first half of a double-click
      if (d.moved && d.steps) transposeNotes(d.ids, d.steps, 'diatonic');
      return;
    }
    const xa = Math.min(d.x0, d.x1);
    const xb = Math.max(d.x0, d.x1);
    const ya = Math.min(d.y0, d.y1);
    const yb = Math.max(d.y0, d.y1);
    if (xb - xa < 4 && yb - ya < 4) {
      // Click: a bar inside the staff selects the bar (passage), elsewhere clears.
      if (inStaff(d.y0) && d.x0 >= axis.x0 - 2) {
        const bar = Math.floor(tickAt(d.x0) / bt);
        let from = bar * bt;
        let to = from + bt;
        const cur = useApp.getState().timeSel;
        if (e.shiftKey && cur) {
          from = Math.min(from, cur.from);
          to = Math.max(to, cur.to);
        }
        setTimeSel({ from, to });
        selectTimeRange(from, to);
      } else {
        deselectNotes();
        setTimeSel(null);
      }
      return;
    }
    const hits: string[] = [];
    for (const [id, h] of eng.heads) if (h.x >= xa && h.x <= xb && h.y >= ya - sp / 2 && h.y <= yb + sp / 2) hits.push(id);
    selectNotes(hits, d.additive);
  };

  // ---------------------------------------------------------------- overlays

  const extras: ReactElement[] = [];
  const ledgers = (key: string, x: number, pos: number, w: number, cls: string) => {
    for (let lp = -2; lp >= pos; lp -= 2) extras.push(<line key={`${key}l${lp}`} x1={x - M.legerExt * sp} x2={x + w + M.legerExt * sp} y1={yOfPos(lp)} y2={yOfPos(lp)} strokeWidth={M.legerW * sp} className={`ln ${cls}`} />);
    for (let lp = 10; lp <= pos; lp += 2) extras.push(<line key={`${key}u${lp}`} x1={x - M.legerExt * sp} x2={x + w + M.legerExt * sp} y1={yOfPos(lp)} y2={yOfPos(lp)} strokeWidth={M.legerW * sp} className={`ln ${cls}`} />);
  };
  const headW = M.headW * sp;

  if (drag?.kind === 'pitch' && drag.moved && drag.steps) {
    for (const id of drag.ids) {
      const h = eng.heads.get(id);
      if (!h) continue;
      const pos = Math.round(8 - (h.y - eng.top) / (sp / 2)) + drag.steps;
      const x = h.x - headW / 2;
      ledgers(`d${id}`, x, pos, headW, 'drag-ghost');
      extras.push(
        <text key={`d${id}`} x={x} y={yOfPos(pos)} fontSize={sp * 4} className="smufl drag-ghost" pointerEvents="none">
          {G.noteheadBlack}
        </text>,
      );
      if (id === drag.hit.id) {
        const pitch = transposeDiatonic([drag.hit], drag.steps, drawingScaleAt(project, drag.hit.abs))[0].pitch;
        extras.push(
          <text key="dl" x={x + headW + 6} y={yOfPos(pos) - 6} className="staff-tip" pointerEvents="none">
            {`${prettyPitch(pitch, keyFifths(scaleAtTick(project, drag.hit.abs)))} (${drag.steps > 0 ? '+' : ''}${drag.steps})`}
          </text>,
        );
      }
    }
  }

  if (input && input.caret >= axis.startTick && input.caret <= axis.endTick) {
    const x = eng.map(input.caret) + 0.1 * sp;
    extras.push(
      <g key="caret" className="caret" pointerEvents="none">
        <line x1={x} x2={x} y1={eng.top - 1.5 * sp} y2={eng.top + 5.5 * sp} />
        <path d={`M${x - 4},${eng.top - 1.5 * sp - 5} h8 l-4,5 z`} />
      </g>,
    );
  }

  if (input && hover && !drag) {
    const x = eng.map(hover.tick) + 0.45 * sp;
    const ch = noteLength >= TPQ * 4 ? G.noteheadWhole : noteLength >= TPQ * 2 ? G.noteheadHalf : G.noteheadBlack;
    const w = noteLength >= TPQ * 4 ? M.wholeW * sp : headW;
    ledgers('sh', x, hover.pos, w, 'shadow');
    const pitch = pitchAt(hover.pos, hover.tick);
    extras.push(
      <text key="sh" x={x} y={yOfPos(hover.pos)} fontSize={sp * 4} className="smufl shadow" pointerEvents="none">
        {ch}
      </text>,
      <text key="shl" x={x + w + 5} y={yOfPos(hover.pos) - 5} className="staff-tip" pointerEvents="none">
        {prettyPitch(pitch, keyFifths(scaleAtTick(project, hover.tick)))}
      </text>,
    );
  }

  const cursor = input ? 'crosshair' : 'default';
  return (
    <svg
      ref={svgRef}
      className="svg-fill staff-editor"
      style={{ cursor }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => hover && setHover(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onContextMenu?.({ x: e.clientX, y: e.clientY }, snapTick(tickAt(local(e).x)));
      }}
      onDoubleClick={(e) => {
        if (!(e.target as Element).classList.contains('hit')) props.onBackgroundDoubleClick?.();
      }}
    >
      {props.before}
      <g className="staff-g">{renderPrims(eng.prims, sp, onNoteDown)}</g>
      {props.overlay?.(eng)}
      {extras}
      {drag?.kind === 'marquee' && (Math.abs(drag.x1 - drag.x0) > 3 || Math.abs(drag.y1 - drag.y0) > 3) && (
        <rect
          x={Math.min(drag.x0, drag.x1)}
          y={Math.min(drag.y0, drag.y1)}
          width={Math.abs(drag.x1 - drag.x0)}
          height={Math.abs(drag.y1 - drag.y0)}
          fill="rgba(46,111,211,0.1)"
          stroke="var(--blue)"
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      )}
      {props.after}
    </svg>
  );
}
