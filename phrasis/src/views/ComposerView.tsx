import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { densityFingerprint } from '../model/analysis';
import { absoluteNotes, cadencePoints, CADENCES, placeDrawings, scaleAtTick, totalBars } from '../model/syntax';
import { keyFifths, keyLabel, romanDegree } from '../model/theory';
import { T16 } from '../model/types';
import type { Note, Project } from '../model/types';
import { Staff } from '../notation/Staff';
import type { EngraveOptions, StaffGeometry } from '../notation/layout';
import { Panel, VIEW_ITEMS } from '../components/Panel';
import { PianoRoll, rollRange } from '../components/PianoRoll';
import type { RollNote } from '../components/PianoRoll';
import { BarNumbers, Playhead, SyntaxBrackets, useAxis } from '../components/Timeline';
import type { Axis } from '../components/Timeline';
import { Segmented } from '../components/ui/Controls';
import { useSize } from '../components/useSize';
import {
  addNote,
  applyDrawingTransform,
  audition,
  bendContour,
  deleteNotes,
  editNotes,
  moveNotes,
  resizeNotes,
  scrollBy,
  selectNotes,
  setArticulation,
  setUi,
  setView,
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

// ---------------------------------------------------------------------------

function MelodicStaff({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
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
  const drawingIndex = useMemo(() => new Map(project.drawings.map((d, i) => [d.id, i])), [project.drawings]);
  const sel = useMemo(() => new Set(noteSel), [noteSel]);
  const classOf = useCallback(
    (id: string | undefined) => {
      if (!id) return undefined;
      if (sel.has(id)) return 'sel';
      if (show === 'syntax') return DRAWING_COLORS[(drawingIndex.get(drawingOf.get(id) ?? '') ?? 0) % DRAWING_COLORS.length];
      return undefined;
    },
    [sel, show, drawingIndex, drawingOf],
  );

  const onNoteDown = (id: string, e: React.PointerEvent) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    selectNotes([id], e.shiftKey || e.metaKey);
    audition([{ ...n, start: 0, dur: Math.min(n.dur, 600) }]);
  };

  return (
    <svg className="svg-fill" onPointerDown={() => selectNotes([])}>
      <SyntaxBrackets project={project} axis={axis} y={48} bottom={height - 14} prefix="Drawing" selectedId={selectedId} />
      <Staff notes={notes as Note[]} opts={opts} geo={geo} xOf={axis.xOf} spacing={axis.bars > 8 ? 'barwise' : 'axis'} classOf={classOf} onNoteDown={onNoteDown}>
        {(eng) => {
          const extras: ReactElement[] = [];
          if (show === 'contour' || show === 'syntax') {
            // Contour polyline per drawing, with draggable turning points.
            for (const pl of placeDrawings(project)) {
              const pts = notes
                .filter((n) => n.drawingId === pl.drawing.id)
                .map((n) => ({ n, h: eng.heads.get(n.id) }))
                .filter((p): p is { n: (typeof notes)[number]; h: { x: number; y: number } } => !!p.h);
              if (pts.length < 2) continue;
              if (show === 'contour') {
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
                      onPointerUp={() => {
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
      </Staff>
      <Playhead axis={axis} top={36} bottom={height - 14} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

function RhythmicStaff({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
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
  const classOf = useCallback((id: string | undefined) => (id && sel.has(id) ? 'sel' : undefined), [sel]);

  const cells = useMemo(() => densityFingerprint(notes as Note[], axis.startTick, axis.endTick, T16, project.meter), [notes, axis.startTick, axis.endTick, project.meter]);
  const cad = cadencePoints(project);
  const cadIds = new Set(cad.map((c) => notes.find((n) => n.abs === c.arrival)?.id).filter(Boolean) as string[]);
  const inSelected = new Set(notes.filter((n) => n.drawingId === selectedId).map((n) => n.id));
  const densY = height - 22;
  const densH = 24;
  const step = axis.xOf(axis.startTick + T16) - axis.xOf(axis.startTick);

  return (
    <svg className="svg-fill" onPointerDown={() => selectNotes([])} onDoubleClick={() => setView('rhythm')}>
      <SyntaxBrackets project={project} axis={axis} y={30} bottom={height - 4} prefix="Drawing" selectedId={selectedId} showTint={false} />
      <Staff
        notes={notes as Note[]}
        opts={opts}
        geo={geo}
        xOf={axis.xOf}
        spacing={axis.bars > 8 ? 'barwise' : 'axis'}
        classOf={classOf}
        onNoteDown={(id, e) => {
          selectNotes([id], e.shiftKey || e.metaKey);
          const n = notes.find((x) => x.id === id);
          if (n) audition([{ ...n, start: 0, dur: Math.min(n.dur, 600) }]);
        }}
      />
      <text x={24} y={densY + 2} className="axis-label">
        Density
      </text>
      {cells.map((c, i) => {
        const x = axis.xOf(axis.startTick + i * T16) + step / 2 - 1;
        const h = Math.max(3, c.value * densH);
        const color = c.onset && c.noteId && (cadIds.has(c.noteId) || c.accent) ? 'var(--orange)' : c.onset && c.noteId && inSelected.has(c.noteId) ? 'var(--bracket-blue)' : c.onset ? '#9d9da1' : '#cfcecb';
        return <rect key={i} x={x} y={densY + (densH - h) / 2 - 8} width={2.4} height={h} fill={color} rx={0.6} />;
      })}
      <Playhead axis={axis} top={20} bottom={height - 4} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

function Roll({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
  const noteSel = useApp((s) => s.noteSel);
  const snap = useApp((s) => s.snap);
  const noteLength = useApp((s) => s.noteLength);
  const selectedId = useSelectedDrawingId();
  const notes = useViewNotes(project, axis);
  const range = useMemo(() => rollRange(absoluteNotes(project).map((n) => n.pitch), 28), [project]);
  const rollNotes: RollNote[] = useMemo(() => {
    const out: RollNote[] = notes.map((n) => ({ id: n.id, pitch: n.pitch, start: n.abs, dur: n.dur, vel: n.vel }));
    for (const n of project.lowerVoice ?? []) if (n.start < axis.endTick && n.start + n.dur > axis.startTick) out.push({ id: `lv${n.id}`, pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel, ghost: true });
    return out;
  }, [notes, project.lowerVoice, axis.startTick, axis.endTick]);
  const top = 30;
  const gridH = height - top - 40;
  const drawingScale = project.drawings.find((d) => d.id === selectedId)?.scale ?? project.key;

  return (
    <svg className="svg-fill">
      <SyntaxBrackets project={project} axis={axis} y={24} bottom={top + gridH} prefix="Drawing" selectedId={selectedId} showTint={false} cadTop={24} />
      <PianoRoll
        notes={rollNotes}
        axis={axis}
        top={top}
        height={gridH}
        keysX={12}
        range={{ lo: Math.min(range.lo, 48), hi: range.hi }}
        scale={drawingScale}
        selected={noteSel}
        snap={snap}
        noteLength={noteLength}
        fifths={keyFifths(project.key)}
        onSelect={(ids, additive) => selectNotes(ids, additive)}
        onMove={(ids, dTick, dPitch, copy) => {
          if (copy) {
            const set = new Set(ids);
            editNotes((all) => [...all, ...all.filter((n) => set.has(n.id)).map((n) => ({ ...n, id: `${n.id}c${Date.now().toString(36)}`, abs: n.abs + dTick, pitch: n.pitch + dPitch }))]);
          } else moveNotes(ids, dTick, dPitch);
        }}
        onResize={resizeNotes}
        onAdd={(t, p, d) => addNote(t, p, d)}
        onDelete={deleteNotes}
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
          return <rect x={xa} y={top} width={xb - xa} height={gridH} fill="rgba(74,136,223,0.10)" pointerEvents="none" />;
        })()}
      </PianoRoll>
      {cadencePoints(project).map((c) => {
        const x = axis.xOf(c.arrival);
        return x >= axis.x0 && x <= axis.x1 ? <line key={c.drawingId} x1={x} x2={x} y1={24} y2={top + gridH} className="cad-line" pointerEvents="none" /> : null;
      })}
      <BarNumbers axis={axis} y={top + gridH + 26} />
      <Playhead axis={axis} top={top} bottom={top + gridH} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function ComposerView() {
  const project = useProject();
  const show = useApp((s) => s.melodicShow);
  const win = useWindow();
  const [ref1, size1] = useSize<HTMLDivElement>();
  const [ref2, size2] = useSize<HTMLDivElement>();
  const [ref3, size3] = useSize<HTMLDivElement>();
  const axis = useAxis(project, size1.width || size3.width, win);
  const selectedId = useSelectedDrawingId();
  const noteSel = useApp((s) => s.noteSel);
  const total = totalBars(project);

  const staffMenu = [
    ...VIEW_ITEMS('composer'),
    'sep' as const,
    { title: 'Selected drawing' },
    { label: 'Mirror (inversion)', hint: 'M', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'invert') },
    { label: 'Reverse (retrograde)', hint: 'R', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'retrograde') },
    { label: 'Mirror + Reverse', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'retrograde-inversion') },
    { label: 'Sequence +2', onSelect: () => selectedId && applyDrawingTransform(selectedId, 'sequence') },
    'sep' as const,
    { label: 'Accent selected notes', hint: '>', disabled: !noteSel.length, onSelect: () => setArticulation(noteSel, 'accent') },
    { label: 'Staccato selected notes', hint: '.', disabled: !noteSel.length, onSelect: () => setArticulation(noteSel, 'staccato') },
    'sep' as const,
    { label: 'Scroll left', hint: '⇧←', disabled: win.start <= 0, onSelect: () => scrollBy(-win.bars) },
    { label: 'Scroll right', hint: '⇧→', disabled: win.start + win.bars >= total, onSelect: () => scrollBy(win.bars) },
  ];

  return (
    <div className="center composer" onWheel={(e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) scrollBy(e.deltaX > 0 ? 1 : -1);
    }}>
      <Panel
        title="Melodic Staff"
        className="melodic"
        style={{ flex: '0 0 236px' }}
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
          {size1.width > 0 && <MelodicStaff project={project} axis={axis} height={size1.height} />}
        </div>
      </Panel>
      <Panel
        title="Rhythmic Staff"
        className="rhythmic"
        style={{ flex: '0 0 204px' }}
        menu={[
          { label: 'Open in Rhythm Lab', onSelect: () => setView('rhythm') },
          'sep',
          { label: 'Accent selected notes', disabled: !noteSel.length, onSelect: () => setArticulation(noteSel, 'accent') },
          { label: 'Staccato selected notes', disabled: !noteSel.length, onSelect: () => setArticulation(noteSel, 'staccato') },
        ]}
      >
        <div ref={ref2} style={{ position: 'absolute', inset: 0 }}>
          {size2.width > 0 && <RhythmicStaff project={project} axis={axis} height={size2.height} />}
        </div>
      </Panel>
      <Panel
        title="Piano Roll"
        style={{ flex: '1 1 auto' }}
        menu={[
          { title: 'Snap' },
          ...[
            ['1/4', 480],
            ['1/8', 240],
            ['1/16', 120],
          ].map(([l, v]) => ({ label: `Snap ${l}`, checked: useApp.getState().snap === v, onSelect: () => setUi({ snap: v as number, noteLength: v as number }) })),
          'sep',
          { label: 'Delete selected notes', hint: '⌫', disabled: !noteSel.length, onSelect: () => deleteNotes(noteSel) },
          { label: 'Select all in drawing', onSelect: () => selectNotes(project.drawings.find((d) => d.id === selectedId)?.notes.map((n) => n.id) ?? []) },
        ]}
      >
        <div ref={ref3} style={{ position: 'absolute', inset: 0 }}>
          {size3.width > 0 && <Roll project={project} axis={axis} height={size3.height} />}
        </div>
      </Panel>
    </div>
  );
}
