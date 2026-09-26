import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { densityFingerprint } from '../model/analysis';
import { chordPitches } from '../model/editing';
import { absoluteNotes, cadencePoints, CADENCES, placeDrawings, scaleAtTick, totalBars, uid } from '../model/syntax';
import { keyFifths, keyLabel, prettyPitch, romanDegree, snapToScale } from '../model/theory';
import { T16 } from '../model/types';
import type { Note, Project } from '../model/types';
import type { EngraveOptions, StaffGeometry } from '../notation/layout';
import { clipboardItems, lengthLabel, markItems, rollToolHelp, RollToolbar, rollViewItems, selectItems, StaffKeypad, transposeItems } from '../components/EditTools';
import { Panel, VIEW_ITEMS } from '../components/Panel';
import { PianoRoll, rollRange } from '../components/PianoRoll';
import type { RollNote } from '../components/PianoRoll';
import { StaffEditor } from '../components/StaffEditor';
import type { StaffNote } from '../components/StaffEditor';
import { Playhead, SyntaxBrackets, TimeRuler, TimeSelBand, useAxis } from '../components/Timeline';
import type { Axis } from '../components/Timeline';
import { Segmented, useContextMenu } from '../components/ui/Controls';
import type { MenuItem } from '../components/ui/Controls';
import { useSize } from '../components/useSize';
import { VelocityLane } from '../components/VelocityLane';
import {
  addNote,
  addNotesAbs,
  applyDrawingTransform,
  bendContour,
  deleteNotes,
  drawingScaleAt,
  editPeriod,
  resizeNotes,
  resizeNotesStart,
  scrollBy,
  seek,
  selectNotes,
  selectPitch,
  selectTimeRange,
  setTimeSel,
  setUi,
  setVelocities,
  setView,
  setZoom,
  sliceNotes,
  startNoteInput,
  stopNoteInput,
  toggleMuteNotes,
  toggleNoteInput,
  useApp,
  useProject,
  viewWindow,
} from '../store/store';
import type { AppState } from '../store/store';

export function useWindow() {
  const zoom = useApp((s) => s.zoom);
  const scrollBar = useApp((s) => s.scrollBar);
  const project = useProject();
  return useMemo(() => viewWindow({ ...useApp.getState(), zoom, scrollBar } as AppState), [zoom, scrollBar, project]);
}

/** Absolute notes in the visible window (plus a margin so ties render). */
export function useViewNotes(project: Project, axis: Axis) {
  return useMemo(() => {
    const abs = absoluteNotes(project);
    return abs
      .filter((n) => n.abs + n.dur > axis.startTick && n.abs < axis.endTick)
      .map((n) => ({ ...n, start: n.abs }));
  }, [project, axis.startTick, axis.endTick]);
}

function useSelectedDrawingId() {
  return useApp((s) => (s.selection.kind === 'drawing' ? s.selection.id : undefined));
}

const DRAWING_COLORS = ['drawing-c0', 'drawing-c1', 'drawing-c2', 'drawing-c3'];
const DRAWING_FILLS = ['#5d91d6', '#3aa383', '#b477c4', '#d18a3c'];

type OpenMenu = (client: { x: number; y: number }, items: MenuItem[]) => void;

/** "3.2.1" — bar, beat and sixteenth of a tick. */
function barBeat(tick: number, axis: Axis): string {
  const bar = Math.floor(tick / axis.barLen);
  const inBar = tick - bar * axis.barLen;
  const beat = Math.floor(inBar / axis.beatLen);
  const six = Math.floor((inBar - beat * axis.beatLen) / T16);
  return `${bar + 1}.${beat + 1}.${six + 1}`;
}

function staffMenuAt(tick: number, axis: Axis): MenuItem[] {
  const s = useApp.getState();
  const bar = Math.floor(tick / axis.barLen);
  return [
    ...clipboardItems(tick),
    'sep',
    s.noteInput ? { label: 'Stop note input', hint: 'Esc', onSelect: stopNoteInput } : { label: 'Start note input here', hint: 'N', onSelect: () => startNoteInput(tick) },
    {
      label: `Select bar ${bar + 1}`,
      onSelect: () => {
        setTimeSel({ from: bar * axis.barLen, to: (bar + 1) * axis.barLen });
        selectTimeRange(bar * axis.barLen, (bar + 1) * axis.barLen);
      },
    },
    { label: 'Note properties…', hint: 'dbl-click', disabled: !s.noteSel.length, onSelect: () => setUi({ modal: { kind: 'note-props' } }) },
    ...markItems(),
    ...transposeItems(true),
  ];
}

// ---------------------------------------------------------------------------

function MelodicStaff({ project, axis, height, openMenu }: { project: Project; axis: Axis; height: number; openMenu: OpenMenu }) {
  const show = useApp((s) => s.melodicShow);
  const noteSel = useApp((s) => s.noteSel);
  const selectedId = useSelectedDrawingId();
  const library = useApp((s) => s.library);
  const notes = useViewNotes(project, axis);
  const fifths = keyFifths(project.key);
  const total = totalBars(project) * axis.barLen;
  const [bend, setBend] = useState<{ drawingId: string; noteId: string; y0: number; steps: number } | null>(null);
  const sp = axis.bars > 8 ? 6.6 : 8;
  const staffTop = Math.max(78, Math.min(98, height / 2 - 6));

  const opts = useMemo<EngraveOptions>(
    () => ({
      clef: 'treble',
      fifths,
      meter: project.meter,
      from: axis.startTick,
      to: axis.endTick,
      spellFifths: (t: number) => keyFifths(scaleAtTick(project, t)),
    }),
    [fifths, project, axis.startTick, axis.endTick],
  );
  const geo = useMemo<StaffGeometry>(
    () => ({ sp, top: staffTop, left: 10, right: axis.x1, preludeX: 8, finalBar: axis.endTick >= total }),
    [sp, staffTop, axis.x1, axis.endTick, total],
  );
  const drawingOf = useMemo(() => new Map(notes.map((n) => [n.id, n.drawingId])), [notes]);
  const muted = useMemo(() => new Set(notes.filter((n) => n.mute).map((n) => n.id)), [notes]);
  const drawingIndex = useMemo(() => new Map(project.drawings.map((d, i) => [d.id, i])), [project.drawings]);
  const sel = useMemo(() => new Set(noteSel), [noteSel]);
  const classOf = useCallback(
    (id: string | undefined) => {
      if (!id) return undefined;
      if (sel.has(id)) return 'sel';
      if (muted.has(id)) return 'dim';
      if (show === 'syntax') return DRAWING_COLORS[(drawingIndex.get(drawingOf.get(id) ?? '') ?? 0) % DRAWING_COLORS.length];
      return undefined;
    },
    [sel, muted, show, drawingIndex, drawingOf],
  );

  return (
    <StaffEditor
      project={project}
      notes={notes as StaffNote[]}
      opts={opts}
      geo={geo}
      axis={axis}
      spacing={axis.bars > 8 ? 'barwise' : 'axis'}
      classOf={classOf}
      pitched
      onContextMenu={(client, tick) => openMenu(client, staffMenuAt(tick, axis))}
      before={
        <>
          <SyntaxBrackets project={project} axis={axis} y={48} bottom={height - 14} prefix="Drawing" selectedId={selectedId} />
          <TimeSelBand axis={axis} top={40} bottom={height - 14} />
        </>
      }
      after={<Playhead axis={axis} top={36} bottom={height - 14} />}
      overlay={(eng) => {
        const extras: ReactElement[] = [];
        if (show === 'contour') {
          // Contour polyline per drawing, with draggable turning points.
          for (const pl of placeDrawings(project)) {
            const pts = notes
              .filter((n) => n.drawingId === pl.drawing.id)
              .map((n) => ({ n, h: eng.heads.get(n.id) }))
              .filter((p): p is { n: (typeof notes)[number]; h: { x: number; y: number } } => !!p.h);
            if (pts.length < 2) continue;
            extras.push(
              <polyline
                key={`c${pl.drawing.id}`}
                points={pts.map((p) => `${p.h.x},${p.h.y - (bend && bend.noteId === p.n.id ? bend.steps * (sp / 2) : 0)}`).join(' ')}
                fill="none"
                stroke={pl.drawing.id === selectedId ? 'var(--bracket-blue)' : '#9b9ba0'}
                strokeWidth={1.6}
                strokeLinejoin="round"
                opacity={0.85}
                pointerEvents="none"
              />,
            );
            pts.forEach((p, i) => {
              const prev = pts[i - 1]?.n.pitch;
              const next = pts[i + 1]?.n.pitch;
              const turning = prev === undefined || next === undefined || Math.sign(p.n.pitch - prev) !== Math.sign(next - p.n.pitch);
              if (!turning) return;
              const dy = bend && bend.noteId === p.n.id ? bend.steps * (sp / 2) : 0;
              extras.push(
                <circle
                  key={`v${p.n.id}`}
                  cx={p.h.x}
                  cy={p.h.y - dy}
                  r={5}
                  fill="#fff"
                  stroke="var(--bracket-blue)"
                  strokeWidth={1.6}
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    setBend({ drawingId: pl.drawing.id, noteId: p.n.id, y0: e.clientY, steps: 0 });
                  }}
                  onPointerMove={(e) => {
                    if (!bend) return;
                    const steps = Math.round((bend.y0 - e.clientY) / (sp / 2));
                    if (steps !== bend.steps) setBend({ ...bend, steps });
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (bend) bendContour(bend.drawingId, bend.noteId, bend.steps);
                    setBend(null);
                  }}
                >
                  <title>Drag to raise or lower this turning point (keeps the drawing's internal relations)</title>
                </circle>,
              );
            });
          }
        }
        if (show === 'syntax') {
          // Motif symbols under each drawing and punctuation at each rest point.
          for (const pl of placeDrawings(project)) {
            const x = axis.xOf(pl.startTick) + 10;
            if (x < axis.x0 || x > axis.x1) continue;
            const m = library.find((mm) => mm.id === pl.drawing.motifRef);
            if (m)
              extras.push(
                <text key={`m${pl.drawing.id}`} x={x} y={eng.top + 4 * sp + 30} fontSize={15} fontStyle="italic" fill="var(--text-2)" fontFamily="'Times New Roman', Georgia, serif">
                  {m.symbol}
                  {pl.drawing.transform !== 'none' ? '′' : ''}
                </text>,
              );
          }
          let lastX = -Infinity;
          for (const n of notes) {
            if (n.drawingId !== selectedId) continue;
            const h = eng.heads.get(n.id);
            if (!h || h.x - lastX < 15) continue;
            lastX = h.x;
            extras.push(
              <text key={`deg${n.id}`} x={h.x} y={eng.top + 4 * sp + 44} textAnchor="middle" fontSize={8.5} fill="var(--blue)" opacity={0.85}>
                {romanDegree(n.pitch, scaleAtTick(project, n.abs))}
              </text>,
            );
          }
          for (const c of cadencePoints(project)) {
            const x = axis.xOf(c.endTick) - 12;
            if (x < axis.x0 || x > axis.x1 + 4) continue;
            extras.push(
              <text key={`p${c.drawingId}`} x={x} y={eng.top - 10} fontSize={22} fontWeight={600} fill="var(--orange)">
                {CADENCES[c.type].punct}
              </text>,
            );
          }
        }
        return <g>{extras}</g>;
      }}
    />
  );
}

// ---------------------------------------------------------------------------

function RhythmicStaff({ project, axis, height, openMenu }: { project: Project; axis: Axis; height: number; openMenu: OpenMenu }) {
  const noteSel = useApp((s) => s.noteSel);
  const selectedId = useSelectedDrawingId();
  const viewNotes = useViewNotes(project, axis);
  const notes = useMemo(() => viewNotes.map((n) => ({ ...n, slur: undefined })), [viewNotes]);
  const total = totalBars(project) * axis.barLen;
  const sp = axis.bars > 8 ? 7.6 : 9;
  const top = 58;
  const opts = useMemo<EngraveOptions>(
    () => ({ clef: 'percussion', fifths: 0, meter: project.meter, from: axis.startTick, to: axis.endTick, percussion: () => ({ positions: [1] }) }),
    [project.meter, axis.startTick, axis.endTick],
  );
  const geo = useMemo<StaffGeometry>(() => ({ sp, top, left: 10, right: axis.x1, preludeX: 8, showKey: false, finalBar: axis.endTick >= total }), [sp, axis.x1, axis.endTick, total]);
  const sel = useMemo(() => new Set(noteSel), [noteSel]);
  const muted = useMemo(() => new Set(notes.filter((n) => n.mute).map((n) => n.id)), [notes]);
  const classOf = useCallback((id: string | undefined) => (id && sel.has(id) ? 'sel' : id && muted.has(id) ? 'dim' : undefined), [sel, muted]);

  const cells = useMemo(() => densityFingerprint(notes as Note[], axis.startTick, axis.endTick, T16, project.meter), [notes, axis.startTick, axis.endTick, project.meter]);
  const cad = cadencePoints(project);
  const cadIds = new Set(cad.map((c) => notes.find((n) => n.abs === c.arrival)?.id).filter(Boolean) as string[]);
  const inSelected = new Set(notes.filter((n) => n.drawingId === selectedId).map((n) => n.id));
  const densY = height - 22;
  const densH = 24;
  const step = axis.xOf(axis.startTick + T16) - axis.xOf(axis.startTick);

  return (
    <StaffEditor
      project={project}
      notes={notes as StaffNote[]}
      opts={opts}
      geo={geo}
      axis={axis}
      spacing={axis.bars > 8 ? 'barwise' : 'axis'}
      classOf={classOf}
      onBackgroundDoubleClick={() => setView('rhythm')}
      onContextMenu={(client, tick) => openMenu(client, [...staffMenuAt(tick, axis), 'sep', { label: 'Open in Rhythm Lab', onSelect: () => setView('rhythm') }])}
      before={
        <>
          <SyntaxBrackets project={project} axis={axis} y={30} bottom={height - 4} prefix="Drawing" selectedId={selectedId} showTint={false} />
          <TimeSelBand axis={axis} top={24} bottom={height - 4} />
        </>
      }
      after={
        <>
          <text x={24} y={densY + 2} className="axis-label">
            Density
          </text>
          {cells.map((c, i) => {
            const x = axis.xOf(axis.startTick + i * T16) + step / 2 - 1;
            const h = Math.max(3, c.value * densH);
            const color = c.onset && c.noteId && (cadIds.has(c.noteId) || c.accent) ? 'var(--orange)' : c.onset && c.noteId && inSelected.has(c.noteId) ? 'var(--bracket-blue)' : c.onset ? '#9d9da1' : '#cfcecb';
            return <rect key={i} x={x} y={densY + (densH - h) / 2 - 8} width={2.4} height={h} fill={color} rx={0.6} pointerEvents="none" />;
          })}
          <Playhead axis={axis} top={20} bottom={height - 4} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------

export interface RollView {
  hi: number;
  rows: number;
}

function Roll({ project, axis, height, openMenu, view: userView, setView: setUserView }: { project: Project; axis: Axis; height: number; openMenu: OpenMenu; view: RollView | null; setView: (v: RollView | null) => void }) {
  const noteSel = useApp((s) => s.noteSel);
  const snap = useApp((s) => s.snap);
  const noteLength = useApp((s) => s.noteLength);
  const tool = useApp((s) => s.rollTool);
  const stamp = useApp((s) => s.stamp);
  const opts = useApp((s) => s.rollOpts);
  const scaleQ = useApp((s) => s.scaleQuantize);
  const playing = useApp((s) => s.playing);
  const selectedId = useSelectedDrawingId();
  const notes = useViewNotes(project, axis);
  const [hover, setHover] = useState<{ tick: number; pitch: number; note?: RollNote } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fifths = keyFifths(project.key);
  const allPitches = useMemo(() => absoluteNotes(project).map((n) => n.pitch), [project]);
  const empty = allPitches.length === 0;

  const rulerY = 30;
  const top = rulerY + 18;
  // The velocity lane steps aside when the panel is too short for both.
  const laneH = opts.velocity && height >= 270 ? 50 : 0;
  const statusH = 20;
  const gridH = Math.max(60, height - top - (laneH ? laneH + 10 : 0) - statusH);

  const auto = useMemo<RollView>(() => {
    const fit = rollRange(allPitches, 24);
    const rowsFit = fit.hi - fit.lo + 1;
    const rows = Math.min(Math.max(8, Math.floor(gridH / 9)), Math.max(Math.ceil(gridH / 16), rowsFit));
    const mid = allPitches.length ? (Math.min(...allPitches) + Math.max(...allPitches)) / 2 : 67;
    return { hi: Math.round(mid + rows / 2), rows };
  }, [allPitches, gridH]);
  // Fit once, then keep the keyboard still while editing (Fit or a new project re-fits).
  useEffect(() => {
    if (!userView) setUserView(auto);
  }, [userView, auto, setUserView]);
  const view = userView ?? auto;
  const rows = Math.max(8, Math.min(88, view.rows));
  const hi = Math.max(20 + rows, Math.min(108, view.hi));
  const range = { lo: hi - rows + 1, hi };
  const viewRef = useRef({ hi, rows });
  viewRef.current = { hi, rows };

  // Wheel: scroll pitches · ⌥ zoom the keyboard · ⌘/Ctrl zoom time · ⇧ scroll time.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = viewRef.current;
      const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const d = horizontal ? e.deltaX || e.deltaY : e.deltaY;
      acc += d;
      if (e.ctrlKey || e.metaKey) {
        if (Math.abs(acc) >= 40) {
          setZoom(acc < 0 ? 1 : -1);
          acc = 0;
        }
        return;
      }
      if (horizontal) {
        if (Math.abs(acc) >= 60) {
          scrollBy(acc > 0 ? 1 : -1);
          acc = 0;
        }
        return;
      }
      const steps = Math.trunc(acc / 24);
      if (!steps) return;
      acc -= steps * 24;
      if (e.altKey) {
        const rows2 = Math.max(8, Math.min(88, cur.rows + steps * 2));
        const mid = cur.hi - cur.rows / 2;
        setUserView({ rows: rows2, hi: Math.round(mid + rows2 / 2) });
      } else setUserView({ rows: cur.rows, hi: Math.max(20 + cur.rows, Math.min(108, cur.hi - steps)) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setUserView]);

  const drawingIdx = useMemo(() => new Map(project.drawings.map((d, i) => [d.id, i])), [project.drawings]);
  const rollNotes: RollNote[] = useMemo(() => {
    const out: RollNote[] = notes.map((n) => ({
      id: n.id,
      pitch: n.pitch,
      start: n.abs,
      dur: n.dur,
      vel: n.vel,
      mute: n.mute,
      color: opts.byDrawing ? DRAWING_FILLS[(drawingIdx.get(n.drawingId) ?? 0) % DRAWING_FILLS.length] : undefined,
    }));
    if (opts.ghosts)
      for (const n of project.lowerVoice ?? []) if (n.start < axis.endTick && n.start + n.dur > axis.startTick) out.push({ id: `lv${n.id}`, pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel, ghost: true });
    return out;
  }, [notes, project.lowerVoice, axis.startTick, axis.endTick, opts.byDrawing, opts.ghosts, drawingIdx]);

  const soundingKey = useApp((s) =>
    s.playing
      ? notes
          .filter((n) => !n.mute && n.abs <= s.playhead && s.playhead < n.abs + n.dur)
          .map((n) => n.pitch)
          .join(',')
      : '',
  );
  const sounding = useMemo(() => new Set(soundingKey ? soundingKey.split(',').map(Number) : []), [soundingKey]);

  const drawingScale = project.drawings.find((d) => d.id === selectedId)?.scale ?? project.key;
  const stampFn = stamp === 'none' ? undefined : (root: number) => chordPitches(stamp, root, drawingScale);
  const quantizePitch = scaleQ ? (p: number, t: number) => snapToScale(p, drawingScaleAt(project, t)) : undefined;

  const onMove = (ids: string[], dTick: number, dPitch: number, copy: boolean) => {
    const sel = new Set(ids);
    editPeriod((all) => {
      const moved = all
        .filter((n) => sel.has(n.id))
        .map((n) => {
          const start = Math.max(0, n.start + dTick);
          let pitch = Math.max(21, Math.min(108, n.pitch + dPitch));
          if (scaleQ && dPitch) pitch = snapToScale(pitch, drawingScaleAt(project, start));
          return { ...n, id: copy ? uid('n') : n.id, start, pitch };
        });
      return copy ? { notes: [...all, ...moved], sel: moved.map((n) => n.id) } : { notes: [...all.filter((n) => !sel.has(n.id)), ...moved] };
    });
  };

  let status = rollToolHelp(tool);
  if (hover) {
    const sc = scaleAtTick(project, hover.tick);
    status = `${prettyPitch(hover.pitch, keyFifths(sc))} · ${barBeat(hover.tick, axis)} · ${romanDegree(hover.pitch, sc)} in ${keyLabel(sc)}`;
    if (hover.note) status += ` · ${lengthLabel(hover.note.dur)} · vel ${hover.note.vel}${hover.note.mute ? ' · muted' : ''}`;
  }

  return (
    <svg className="svg-fill" ref={svgRef}>
      <SyntaxBrackets project={project} axis={axis} y={24} bottom={top + gridH} prefix="Drawing" selectedId={selectedId} showTint={false} cadTop={top} />
      <TimeRuler axis={axis} y={rulerY} snap={Math.max(snap, T16)} />
      <PianoRoll
        notes={rollNotes}
        axis={axis}
        top={top}
        height={gridH}
        keysX={12}
        range={range}
        scale={drawingScale}
        scaleHighlight={opts.scale}
        selected={noteSel}
        tool={tool}
        snap={snap}
        noteLength={noteLength}
        fifths={fifths}
        showNames={opts.names}
        velocityShade
        sounding={playing ? sounding : undefined}
        stamp={stampFn}
        quantizePitch={quantizePitch}
        onSelect={(ids, additive) => selectNotes(ids, additive)}
        onMove={onMove}
        onResize={(ids, d, edge) => (edge === 'end' ? resizeNotes(ids, d) : resizeNotesStart(ids, d))}
        onAdd={(t, p, d) => addNote(t, p, d)}
        onAddMany={addNotesAbs}
        onDelete={deleteNotes}
        onMute={toggleMuteNotes}
        onSlice={sliceNotes}
        onScrub={(t) => (useApp.getState().playing ? seek(t) : setUi({ playhead: Math.max(0, t) }))}
        onNoteClick={(n) => n.dur >= T16 / 2 && setUi({ noteLength: n.dur })}
        onNoteDoubleClick={(n) => {
          selectNotes([n.id]);
          setUi({ modal: { kind: 'note-props' } });
        }}
        onKeySelect={selectPitch}
        onContextMenu={(client, at) => openMenu(client, [...clipboardItems(Math.floor(at.tick / Math.max(1, snap)) * Math.max(1, snap)), ...selectItems(), ...rollViewItems(useApp.getState().rollOpts)])}
        onHover={setHover}
        describe={(n) => {
          const sc = scaleAtTick(project, n.start);
          return `${romanDegree(n.pitch, sc)} in ${keyLabel(sc)}`;
        }}
      >
        {(() => {
          const pl = placeDrawings(project).find((x) => x.drawing.id === selectedId);
          if (!pl) return null;
          const xa = Math.max(axis.x0, axis.xOf(pl.startTick));
          const xb = Math.min(axis.x1, axis.xOf(pl.endTick));
          if (xb <= xa) return null;
          return <rect x={xa} y={top} width={xb - xa} height={gridH} fill="rgba(74,136,223,0.08)" pointerEvents="none" />;
        })()}
      </PianoRoll>
      <TimeSelBand axis={axis} top={top} bottom={top + gridH} />
      {cadencePoints(project).map((c) => {
        const x = axis.xOf(c.arrival);
        return x >= axis.x0 && x <= axis.x1 ? <line key={c.drawingId} x1={x} x2={x} y1={24} y2={top + gridH} className="cad-line" pointerEvents="none" /> : null;
      })}
      {empty && (
        <text x={(axis.x0 + axis.x1) / 2} y={top + gridH / 2} textAnchor="middle" className="roll-empty" pointerEvents="none">
          Click in the grid to draw notes — or press N and type A–G to write on the staff
        </text>
      )}
      {laneH > 0 && <VelocityLane notes={rollNotes} axis={axis} top={top + gridH + 10} height={laneH} selected={noteSel} labelX={12} onChange={setVelocities} />}
      <text x={axis.x0} y={height - 6} className="roll-status" pointerEvents="none">
        {status}
      </text>
      {noteSel.length > 0 && (
        <text x={axis.x1} y={height - 6} textAnchor="end" className="roll-status" pointerEvents="none">
          {`${noteSel.length} selected`}
        </text>
      )}
      <Playhead axis={axis} top={top} bottom={top + gridH} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function ComposerView() {
  const project = useProject();
  const show = useApp((s) => s.melodicShow);
  const input = useApp((s) => s.noteInput);
  const win = useWindow();
  const [ref1, size1] = useSize<HTMLDivElement>();
  const [ref2, size2] = useSize<HTMLDivElement>();
  const [ref3, size3] = useSize<HTMLDivElement>();
  const axis = useAxis(project, size1.width || size2.width || size3.width, win);
  const selectedId = useSelectedDrawingId();
  const noteSel = useApp((s) => s.noteSel);
  const rollOpts = useApp((s) => s.rollOpts);
  const total = totalBars(project);
  const menu = useContextMenu();
  const [rollView, setRollView] = useState<RollView | null>(null);
  useEffect(() => setRollView(null), [project.id]);

  const staffMenu: MenuItem[] = [
    ...VIEW_ITEMS('composer'),
    'sep',
    { title: 'Note input' },
    { label: input ? 'Stop note input' : 'Start note input', hint: 'N', onSelect: toggleNoteInput },
    ...clipboardItems(),
    ...markItems(),
    { title: 'Selected drawing' },
    { label: 'Mirror (inversion)', hint: 'M', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'invert') },
    { label: 'Reverse (retrograde)', hint: 'R', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'retrograde') },
    { label: 'Mirror + Reverse', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'retrograde-inversion') },
    { label: 'Sequence +2', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'sequence') },
    'sep',
    { label: 'Scroll left', hint: '⇧←', disabled: win.start <= 0, onSelect: () => scrollBy(-win.bars) },
    { label: 'Scroll right', hint: '⇧→', disabled: win.start + win.bars >= total, onSelect: () => scrollBy(win.bars) },
  ];

  return (
    <div
      className="center composer"
      onWheel={(e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) scrollBy(e.deltaX > 0 ? 1 : -1);
      }}
    >
      <Panel
        title="Melodic Staff"
        className={`melodic ${input ? 'inputting' : ''}`}
        style={{ flex: '0 0 236px' }}
        pane="staff"
        collapseId="melodic"
        tools={<StaffKeypad />}
        right={
          <>
            <span className="show-label">Show:</span>
            <Segmented
              value={show}
              onChange={(v) => setUi({ melodicShow: v })}
              options={[
                { value: 'pitches', label: 'Pitches' },
                { value: 'contour', label: 'Contour' },
                { value: 'syntax', label: 'Syntax' },
              ]}
            />
          </>
        }
        menu={staffMenu}
      >
        <div ref={ref1} style={{ position: 'absolute', inset: 0 }}>
          {size1.width > 0 && <MelodicStaff project={project} axis={axis} height={size1.height} openMenu={menu.open} />}
        </div>
      </Panel>
      <Panel
        title="Rhythmic Staff"
        className="rhythmic"
        style={{ flex: '0 0 204px' }}
        pane="staff"
        collapseId="rhythmic"
        menu={[{ label: 'Open in Rhythm Lab', onSelect: () => setView('rhythm') }, 'sep', ...clipboardItems(), ...markItems()]}
      >
        <div ref={ref2} style={{ position: 'absolute', inset: 0 }}>
          {size2.width > 0 && <RhythmicStaff project={project} axis={axis} height={size2.height} openMenu={menu.open} />}
        </div>
      </Panel>
      <Panel
        title="Piano Roll"
        className="roll"
        style={{ flex: '1 1 auto' }}
        pane="roll"
        collapseId="roll"
        tools={<RollToolbar onFit={() => setRollView(null)} />}
        menu={[...rollViewItems(rollOpts), { label: 'Zoom keyboard to fit', onSelect: () => setRollView(null) }, 'sep', ...clipboardItems(), ...selectItems(), ...(noteSel.length ? transposeItems(false) : [])]}
      >
        <div ref={ref3} style={{ position: 'absolute', inset: 0 }}>
          {size3.width > 0 && <Roll project={project} axis={axis} height={size3.height} openMenu={menu.open} view={rollView} setView={setRollView} />}
        </div>
      </Panel>
      {menu.node}
    </div>
  );
}
