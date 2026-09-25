import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { outline, similarity, formatPercent } from '../model/analysis';
import { absoluteNotes, CADENCES, CADENCE_ORDER, cadencePoints, deriveMembers, placeDrawings, scaleAtTick, totalBars } from '../model/syntax';
import type { PlacedDrawing } from '../model/syntax';
import { keyFifths, keyLabel, keyOptions } from '../model/theory';
import type { CadenceType, Note, Project } from '../model/types';
import { buildBars, barwiseMapping, engrave } from '../notation/layout';
import type { EngraveOptions, StaffGeometry } from '../notation/layout';
import { renderPrims } from '../notation/Staff';
import { InspectorHead, Row } from '../components/inspector/Common';
import { Panel, VIEW_ITEMS } from '../components/Panel';
import { PianoRoll, rollRange } from '../components/PianoRoll';
import { Playhead, useAxis } from '../components/Timeline';
import type { Axis } from '../components/Timeline';
import { MenuButton, Popover, Select, Toggle } from '../components/ui/Controls';
import { Grip } from '../components/ui/Icons';
import { useSize } from '../components/useSize';
import {
  addDrawing,
  reorderDrawings,
  select,
  setCadence,
  setDrawingBars,
  setKey,
  setMeter,
  setProjectMeta,
  setRules,
  setTempo,
  setView,
  useApp,
  useProject,
} from '../store/store';


/** Block colours follow member identity: A blue, A′ grey, B tan, then cycle. */
export function memberColor(project: Project, member: string): { fill: string; edge: string } {
  const keys = Array.from(new Set(project.drawings.map((d) => d.member)));
  const i = keys.indexOf(member);
  const palette = [
    { fill: '#cddff3', edge: '#a9c5ec' },
    { fill: '#dcdcdb', edge: '#c9c8c5' },
    { fill: '#efdcc4', edge: '#e0c6a3' },
    { fill: '#d9e8dc', edge: '#b7d0bd' },
  ];
  return palette[Math.max(0, i) % palette.length];
}

function rangeLabel(pl: PlacedDrawing) {
  return pl.endBar - pl.startBar === 1 ? `${pl.startBar + 1}` : `${pl.startBar + 1}–${pl.endBar}`;
}

// ---------------------------------------------------------------------------

function Blocks({ project }: { project: Project }) {
  const selection = useApp((s) => s.selection);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const selId = selection.kind === 'drawing' ? selection.id : '';
  return (
    <div className="blocks" role="list" aria-label="Period units — drag to reorder">
      {project.drawings.map((d, i) => {
        const c = memberColor(project, d.member);
        const sel = d.id === selId;
        return (
          <div
            key={d.id}
            role="listitem"
            className={`block ${sel ? 'sel' : ''} ${drag && drag.over === i && drag.from !== i ? 'drop' : ''}`}
            style={{ background: c.fill, borderColor: sel ? 'var(--bracket-blue)' : 'transparent' }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
              setDrag({ from: i, over: i });
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (drag && drag.over !== i) setDrag({ ...drag, over: i });
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData('text/plain'));
              if (!Number.isNaN(from)) reorderDrawings(from, i);
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            onClick={() => select({ kind: 'drawing', id: d.id })}
            onDoubleClick={() => {
              select({ kind: 'drawing', id: d.id });
              setView('composer');
            }}
            title={`${d.label} · ${d.bars} bars · Member ${d.member} — drag to reorder, double-click to edit`}
          >
            <span className="grip">
              <Grip />
            </span>
            <span className="block-label">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StructureTimeline({ project, width, height }: { project: Project; width: number; height: number }) {
  const selection = useApp((s) => s.selection);
  const total = totalBars(project);
  const win = useMemo(() => ({ start: 0, bars: total }), [total]);
  const axis = useAxis(project, width, win, 24, 24);
  const placed = placeDrawings(project);
  const cads = cadencePoints(project);
  const [resize, setResize] = useState<{ id: string; x0: number; bars0: number; bars: number } | null>(null);
  const [cadEdit, setCadEdit] = useState<{ id: string; anchor: Element } | null>(null);
  const barW = axis.xOf(axis.barLen) - axis.xOf(0);
  const selId = selection.kind === 'drawing' ? selection.id : '';
  const yBar = 44;
  const hBar = 40;
  const rules = project.rules;

  // Live preview of a resize.
  const bars = (d: { id: string; bars: number }) => (resize && resize.id === d.id ? resize.bars : d.bars);
  let acc = 0;
  const live = placed.map((pl) => {
    const b = bars(pl.drawing);
    const out = { pl, start: acc, end: acc + b };
    acc += b;
    return out;
  });
  const xBar = (bar: number) => axis.x0 + bar * barW;

  const pairs = useMemo(() => symmetryPairs(project), [project]);
  const els: ReactElement[] = [];
  for (let b = 0; b <= total; b++) {
    const x = axis.xOf(b * axis.barLen);
    if (b < total)
      els.push(
        <text key={`n${b}`} x={x + barW / 2 - (b === 0 ? barW / 2 - 4 : 0)} y={16} textAnchor={b === 0 ? 'start' : 'middle'} className="axis-label">
          {b + 1}
        </text>,
      );
    els.push(<line key={`t${b}`} x1={x} x2={x} y1={28} y2={yBar + hBar + 8} stroke="#d8d6d1" />);
  }
  live.forEach(({ pl, start, end }) => {
    const c = memberColor(project, pl.drawing.member);
    const x1 = xBar(start);
    const x2 = xBar(end);
    const sel = pl.drawing.id === selId;
    els.push(
      <g key={pl.drawing.id} style={{ cursor: 'pointer' }} onClick={() => select({ kind: 'drawing', id: pl.drawing.id })} onDoubleClick={() => setView('composer')}>
        <rect x={x1} y={yBar} width={x2 - x1} height={hBar} fill={c.fill} stroke={sel ? 'var(--bracket-blue)' : c.edge} strokeWidth={sel ? 1.5 : 1} />
        <text x={(x1 + x2) / 2} y={yBar + hBar / 2 + 5} textAnchor="middle" fontSize={15}>
          {pl.drawing.label}
        </text>
      </g>,
    );
    // Resize handle on the right edge.
    els.push(
      <rect
        key={`h${pl.drawing.id}`}
        x={x2 - 4}
        y={yBar}
        width={8}
        height={hBar}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setResize({ id: pl.drawing.id, x0: e.clientX, bars0: pl.drawing.bars, bars: pl.drawing.bars });
        }}
        onPointerMove={(e) => {
          if (!resize) return;
          const b = Math.max(1, Math.min(16, resize.bars0 + Math.round((e.clientX - resize.x0) / barW)));
          if (b !== resize.bars) setResize({ ...resize, bars: b });
        }}
        onPointerUp={() => {
          if (resize && resize.bars !== resize.bars0) setDrawingBars(resize.id, resize.bars);
          setResize(null);
        }}
      >
        <title>Drag to change the length of {pl.drawing.label} (notes are stretched in time)</title>
      </rect>,
    );
  });
  live.forEach(({ pl, end }) => {
    const cad = cads.find((c) => c.drawingId === pl.drawing.id);
    const x = xBar(end);
    const type: CadenceType = pl.drawing.cadence;
    els.push(
      <g
        key={`c${pl.drawing.id}`}
        style={{ cursor: 'pointer' }}
        onClick={(e) => setCadEdit({ id: pl.drawing.id, anchor: e.currentTarget })}
      >
        <rect x={x - 14} y={yBar + hBar + 2} width={28} height={42} fill="transparent" />
        {cad ? (
          <>
            <line x1={x} x2={x} y1={yBar + hBar + 6} y2={yBar + hBar + 20} stroke="var(--orange)" strokeWidth={3} />
            <text x={x} y={yBar + hBar + 33} textAnchor="middle" fontSize={12} fill="var(--text)">
              {CADENCES[type].abbr}
            </text>
            <text x={x} y={yBar + hBar + 47} textAnchor="middle" fontSize={12} fill="var(--text-2)">
              ({CADENCES[type].frac})
            </text>
          </>
        ) : (
          <line x1={x} x2={x} y1={yBar + hBar + 6} y2={yBar + hBar + 12} stroke="#b9b8b4" strokeWidth={1.5} />
        )}
        <title>{`${cad ? CADENCES[type].long : 'No cadence'} at bar ${end} — click to change`}</title>
      </g>,
    );
  });
  // Symmetry: axis and relation arcs
  if (rules.highlightSymmetry) {
    if (rules.symmetryType !== 'asymmetric') {
      const mid = xBar(total / 2);
      els.push(<line key="axis" x1={mid} x2={mid} y1={yBar - 8} y2={yBar + hBar + 8} stroke="var(--bracket-blue)" strokeDasharray="2 3" strokeWidth={1.2} opacity={0.7} />);
    }
    const arcY = yBar - 2;
    pairs
      .filter((p) => (p.kind === 'similarity' && rules.relSimilarity) || (p.kind === 'transformation' && rules.relTransformation) || (p.kind === 'contrast' && rules.relContrast))
      .forEach((p, i) => {
        const a = live.find((l) => l.pl.drawing.id === p.a);
        const b = live.find((l) => l.pl.drawing.id === p.b);
        if (!a || !b) return;
        const xa = (xBar(a.start) + xBar(a.end)) / 2;
        const xb = (xBar(b.start) + xBar(b.end)) / 2;
        const h = 12 + i * 3;
        const color = p.kind === 'contrast' ? 'var(--orange)' : 'var(--bracket-blue)';
        els.push(
          <g key={`arc${i}`} pointerEvents="none" opacity={0.85}>
            <path d={`M${xa},${arcY} C${xa},${arcY - h} ${xb},${arcY - h} ${xb},${arcY}`} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray={p.kind === 'transformation' ? '4 3' : undefined} />
            <rect x={(xa + xb) / 2 - 17} y={arcY - h - 1} width={34} height={13} rx={6} fill="var(--panel)" />
            <text x={(xa + xb) / 2} y={arcY - h + 9} textAnchor="middle" fontSize={10.5} fill={color}>
              {formatPercent(p.score)}
            </text>
          </g>,
        );
      });
  }
  const editing = cadEdit ? project.drawings.find((d) => d.id === cadEdit.id) : undefined;
  return (
    <>
      <svg className="svg-fill" style={{ height }}>
        {els}
        <Playhead axis={axis} top={yBar - 6} bottom={yBar + hBar + 6} />
      </svg>
      <Popover anchor={(cadEdit?.anchor as HTMLElement) ?? null} open={!!cadEdit} onClose={() => setCadEdit(null)} minWidth={180}>
        <div className="pop-title">Rest point after {editing?.label}</div>
        {CADENCE_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            className="pop-item"
            onClick={() => {
              if (cadEdit) setCadence(cadEdit.id, c);
              setCadEdit(null);
            }}
          >
            <span className="check">{editing?.cadence === c ? '✓' : ''}</span>
            {CADENCES[c].long}
          </button>
        ))}
      </Popover>
    </>
  );
}

export interface SymmetryPair {
  kind: 'similarity' | 'transformation' | 'contrast';
  a: string;
  b: string;
  label: string;
  score: number;
}

/** Relations drawn by the Symmetry Lab. */
export function symmetryPairs(project: Project): SymmetryPair[] {
  const placed = placeDrawings(project);
  const len = (pl: PlacedDrawing) => pl.endTick - pl.startTick;
  const sim = (a: PlacedDrawing, b: PlacedDrawing) => {
    const s = similarity(a.drawing.notes, len(a), b.drawing.notes, len(b));
    return (s.contour + s.rhythm + s.interval + s.duration) / 4;
  };
  const out: SymmetryPair[] = [];
  const [first, second] = placed;
  if (first && second && first.drawing.member === second.drawing.member) {
    out.push({ kind: 'similarity', a: first.drawing.id, b: second.drawing.id, label: `${first.drawing.label} ~ ${second.drawing.label} Similarity`, score: sim(first, second) });
  }
  const prime = placed.find((p) => placed.some((q) => q !== p && q.drawing.label === `${p.drawing.label}'`));
  if (prime) {
    const other = placed.find((q) => q.drawing.label === `${prime.drawing.label}'`)!;
    out.push({ kind: 'transformation', a: prime.drawing.id, b: other.drawing.id, label: `${prime.drawing.label} ~ ${other.drawing.label} Transformation`, score: sim(prime, other) });
  }
  const members = deriveMembers(project);
  const contrastMember = members.find((m) => m.key.replace(/'/g, '') !== members[0]?.key.replace(/'/g, '') && m.drawingIds.length >= 2);
  if (contrastMember) {
    const a = placed.find((p) => p.drawing.id === contrastMember.drawingIds[0])!;
    const b = placed.find((p) => p.drawing.id === contrastMember.drawingIds[1])!;
    out.push({ kind: 'contrast', a: a.drawing.id, b: b.drawing.id, label: `${a.drawing.label} ~ ${b.drawing.label} Contrast`, score: 1 - sim(a, b) });
  }
  return out;
}

// ---------------------------------------------------------------------------

function UnitBrackets({ project, axis, y, show }: { project: Project; axis: Axis; y: number; show: boolean }) {
  const selection = useApp((s) => s.selection);
  const selId = selection.kind === 'drawing' ? selection.id : '';
  const members = deriveMembers(project);
  const bMember = members.find((m) => m.key.replace(/'/g, '') !== members[0]?.key.replace(/'/g, ''));
  return (
    <g>
      {placeDrawings(project).map((pl) => {
        const xa = axis.xOf(pl.startTick) + 4;
        const xb = axis.xOf(pl.endTick) - 4;
        const sel = pl.drawing.id === selId;
        const contrast = bMember?.drawingIds.includes(pl.drawing.id);
        const cls = sel ? 'sel' : contrast ? 'cad' : '';
        return (
          <g key={pl.drawing.id} style={{ cursor: 'pointer' }} onClick={() => select({ kind: 'drawing', id: pl.drawing.id })}>
            <path d={`M${xa},${y + 6} V${y} H${xb} V${y + 6}`} className={`bracket ${cls}`} />
            {show && (
              <text x={(xa + xb) / 2} y={y - 8} textAnchor="middle" className={`bracket-label ${cls}`} fontSize={13}>
                {pl.drawing.label} ({rangeLabel(pl)})
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function CadenceTicks({ project, axis, y1, y2, lines }: { project: Project; axis: Axis; y1: number; y2: number; lines?: boolean }) {
  return (
    <g pointerEvents="none">
      {cadencePoints(project).map((c) => {
        const x = lines ? axis.xOf(c.arrival) : axis.xOf(c.endTick) - 10;
        return lines ? (
          <line key={c.drawingId} x1={x} x2={x} y1={y1} y2={y2} stroke="var(--orange)" strokeWidth={2.4} />
        ) : (
          <line key={c.drawingId} x1={x} x2={x} y1={y1} y2={y2} stroke="var(--orange)" strokeWidth={3} />
        );
      })}
    </g>
  );
}

function NotationPreview({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
  const showLabels = project.rules.showPhraseLabels;
  const enforce = project.rules.enforceCadences;
  const notes = useMemo(() => absoluteNotes(project).map((n) => ({ ...n, start: n.abs, art: n.art === 'staccato' ? n.art : undefined })) as Note[], [project]);
  const sp = 5.8;
  const top = Math.max(46, height / 2 - 18);
  const engraved = useMemo(() => {
    const opts: EngraveOptions = {
      clef: 'treble',
      fifths: keyFifths(project.key),
      meter: project.meter,
      from: 0,
      to: axis.endTick,
      spellFifths: (t) => keyFifths(scaleAtTick(project, t)),
    };
    const bars = buildBars(notes, opts);
    const geo: StaffGeometry = { sp, top, left: 12, right: axis.x1, preludeX: 10, finalBar: true };
    return engrave(bars, opts, geo, barwiseMapping(bars, axis.xOf, sp));
  }, [notes, project, axis, top]);
  return (
    <svg className="svg-fill">
      <UnitBrackets project={project} axis={axis} y={24} show={showLabels} />
      {renderPrims(engraved.prims, sp)}
      {enforce && <CadenceTicks project={project} axis={axis} y1={top + 4 * sp + 12} y2={top + 4 * sp + 24} />}
      {Array.from({ length: axis.bars }, (_, b) => (
        <text key={b} x={axis.xOf((b + 0.5) * axis.barLen)} y={height - 14} textAnchor="middle" className="axis-label">
          {b + 1}
        </text>
      ))}
      <Playhead axis={axis} top={top - 6} bottom={top + 4 * sp + 6} />
    </svg>
  );
}

function HarmonicOutline({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
  const showLabels = project.rules.showPhraseLabels;
  const reduced = useMemo(() => outline(absoluteNotes(project).map((n) => ({ ...n, start: n.abs })), axis.barLen / 2, project.meter), [project, axis.barLen]);
  const range = useMemo(() => rollRange(reduced.map((n) => n.pitch), 28), [reduced]);
  const top = 34;
  const gridH = height - top - 30;
  return (
    <svg className="svg-fill">
      <UnitBrackets project={project} axis={axis} y={24} show={showLabels} />
      <PianoRoll
        notes={reduced.map((n) => ({ id: n.id, pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel }))}
        axis={axis}
        top={top}
        height={gridH}
        keysX={16}
        keysW={20}
        range={{ lo: Math.min(range.lo, 48), hi: Math.max(range.hi, 76) }}
        selected={[]}
        snap={axis.barLen / 2}
        noteLength={axis.barLen / 2}
        fifths={keyFifths(project.key)}
        readOnly
        compressed
      />
      {project.rules.enforceCadences && <CadenceTicks project={project} axis={axis} y1={top} y2={top + gridH} lines />}
      {Array.from({ length: axis.bars }, (_, b) => (
        <text key={b} x={axis.xOf((b + 0.5) * axis.barLen)} y={height - 8} textAnchor="middle" className="axis-label">
          {b + 1}
        </text>
      ))}
      <Playhead axis={axis} top={top} bottom={top + gridH} />
    </svg>
  );
}

export function PeriodBuilderView() {
  const project = useProject();
  const total = totalBars(project);
  const win = useMemo(() => ({ start: 0, bars: total }), [total]);
  const [ref1, s1] = useSize<HTMLDivElement>();
  const [ref2, s2] = useSize<HTMLDivElement>();
  const [ref3, s3] = useSize<HTMLDivElement>();
  const axis = useAxis(project, s2.width || s3.width, win, 86, 20);
  return (
    <div className="center">
      <div className="panel-head" style={{ height: 54, flex: 'none' }}>
        <span className="caps">Period Builder</span>
        <span className="spacer" />
        <MenuButton
          label="Period builder options"
          items={[
            ...VIEW_ITEMS('period'),
            'sep',
            { label: 'Add drawing after selection', onSelect: () => addDrawing() },
          ]}
        />
      </div>
      <div className="panel-rule" />
      <Blocks project={project} />
      <Panel title="Structure Timeline" style={{ flex: '0 0 196px' }} menu={[{ label: 'Toggle symmetry highlight', onSelect: () => setRules({ highlightSymmetry: !project.rules.highlightSymmetry }) }]}>
        <div ref={ref1} style={{ position: 'absolute', inset: 0 }}>
          {s1.width > 0 && <StructureTimeline project={project} width={s1.width} height={s1.height} />}
        </div>
      </Panel>
      <Panel title="Notation Preview" style={{ flex: '1 1 0', minHeight: 150 }} menu={[{ label: project.rules.showPhraseLabels ? 'Hide phrase labels' : 'Show phrase labels', onSelect: () => setRules({ showPhraseLabels: !project.rules.showPhraseLabels }) }]}>
        <div ref={ref2} style={{ position: 'absolute', inset: 0 }}>
          {s2.width > 0 && <NotationPreview project={project} axis={axis} height={s2.height} />}
        </div>
      </Panel>
      <Panel title="Harmonic Outline" style={{ flex: '1 1 0', minHeight: 170 }} menu={[{ label: 'Open Composer', onSelect: () => setView('composer') }]}>
        <div ref={ref3} style={{ position: 'absolute', inset: 0 }}>
          {s3.width > 0 && <HarmonicOutline project={project} axis={axis} height={s3.height} />}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

const FORMS = ["Period (AA'BB)", 'Period (AB)', "Sentence (aa'b)", 'Double period', 'Phrase group', 'Rounded binary'];
const TEMPI = [60, 72, 84, 96, 100, 108, 112, 120, 132, 144];

export function PeriodInspector() {
  const project = useProject();
  const placed = placeDrawings(project);
  const pairs = symmetryPairs(project);
  const r = project.rules;
  const half = totalBars(project) / 2;
  const members = deriveMembers(project);
  const describe = (inHalf: (startBar: number, endBar: number) => boolean) => {
    const ms = members.filter((m) => inHalf(m.startBar, m.endBar));
    if (ms.length === 1) return placed.filter((p) => ms[0].drawingIds.includes(p.drawing.id)).map((p) => p.drawing.bars);
    return ms.map((m) => m.endBar - m.startBar);
  };
  const firstHalf = describe((_a, b) => b <= half);
  const secondHalf = describe((a) => a >= half);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const balanced = sum(firstHalf) === sum(secondHalf) && firstHalf.length > 0 && secondHalf.length > 0;
  const struct = `${firstHalf.join('+') || '—'} | ${secondHalf.join('+') || '—'}`;
  const forms = FORMS.includes(project.form) ? FORMS : [project.form, ...FORMS];
  return (
    <>
      <InspectorHead menu={[{ label: 'Back to Composer', onSelect: () => setView('composer') }]} />
      <div className="insp-title" style={{ letterSpacing: '0.04em' }}>
        {project.periodName}
      </div>
      <div className="insp-sub">Phrase Architecture</div>
      <div className="period-meta">
        <Row label="Form" compact className="wide-control">
          <Select size="sm" value={project.form} options={forms.map((f) => ({ value: f, label: f }))} onChange={(v) => setProjectMeta({ form: v })} ariaLabel="Form" />
        </Row>
        <Row label="Key" compact>
          <Select size="sm" value={project.key} options={keyOptions().map((k) => ({ value: k, label: keyLabel(k) }))} onChange={setKey} ariaLabel="Key" />
        </Row>
        <Row label="Meter" compact>
          <Select
            size="sm"
            value={project.meter}
            options={[
              { num: 2, den: 4 },
              { num: 3, den: 4 },
              { num: 4, den: 4 },
              { num: 6, den: 8 },
            ].map((m) => ({ value: m, label: `${m.num}/${m.den}` }))}
            onChange={setMeter}
            ariaLabel="Meter"
          />
        </Row>
        <Row label="Tempo" compact>
          <Select size="sm" value={project.tempo} options={(TEMPI.includes(project.tempo) ? TEMPI : [...TEMPI, project.tempo].sort((a, b) => a - b)).map((t) => ({ value: t, label: `${t} BPM` }))} onChange={setTempo} ariaLabel="Tempo" />
        </Row>
        <Row label="Length" compact>
          <div className="field sm">{totalBars(project)} bars</div>
        </Row>
      </div>

      <div className="insp-section">
        <div className="insp-caps">Member Lengths</div>
        {placed.map((pl) => (
          <Row key={pl.drawing.id} label={pl.drawing.label} compact>
            <Select size="sm" value={pl.drawing.bars} options={[1, 2, 3, 4, 6, 8].map((b) => ({ value: b, label: `${b} bar${b > 1 ? 's' : ''}` }))} onChange={(v) => setDrawingBars(pl.drawing.id, v)} ariaLabel={`Length of ${pl.drawing.label}`} />
          </Row>
        ))}
      </div>

      <div className="insp-section">
        <div className="insp-caps">Cadence Punctuation</div>
        {placed
          .filter((pl) => pl.drawing.cadence !== 'open')
          .map((pl) => (
            <Row key={pl.drawing.id} label={`Bar ${pl.endBar}`} compact>
              <Select size="sm" value={pl.drawing.cadence} options={CADENCE_ORDER.map((c) => ({ value: c, label: CADENCES[c].long }))} onChange={(v) => setCadence(pl.drawing.id, v)} ariaLabel={`Cadence at bar ${pl.endBar}`} />
            </Row>
          ))}
      </div>

      <div className="insp-section">
        <div className="insp-caps">Symmetry</div>
        <Row label="Type" compact className="wide-control">
          <Select
            size="sm"
            value={r.symmetryType}
            options={[
              { value: 'balanced', label: `${balanced ? 'Balanced' : 'Unbalanced'} (${struct})` },
              { value: 'mirror', label: 'Mirror (arch form)' },
              { value: 'asymmetric', label: 'Asymmetric' },
            ]}
            onChange={(v) => setRules({ symmetryType: v as typeof r.symmetryType })}
            ariaLabel="Symmetry type"
          />
        </Row>
        {pairs.map((p) => (
          <div key={p.kind} className="toggle-row" title={`${formatPercent(p.score)}`}>
            <span>{p.label}</span>
            <Toggle
              on={p.kind === 'similarity' ? r.relSimilarity : p.kind === 'transformation' ? r.relTransformation : r.relContrast}
              onChange={(v) => setRules(p.kind === 'similarity' ? { relSimilarity: v } : p.kind === 'transformation' ? { relTransformation: v } : { relContrast: v })}
              ariaLabel={p.label}
            />
          </div>
        ))}
      </div>

      <div className="insp-section">
        <div className="insp-caps">Rules &amp; Guidance</div>
        <div className="toggle-row">
          <span>Enforce cadence points</span>
          <Toggle on={r.enforceCadences} onChange={(v) => setRules({ enforceCadences: v })} ariaLabel="Enforce cadence points" />
        </div>
        <div className="toggle-row">
          <span>Show phrase labels</span>
          <Toggle on={r.showPhraseLabels} onChange={(v) => setRules({ showPhraseLabels: v })} ariaLabel="Show phrase labels" />
        </div>
        <div className="toggle-row">
          <span>Highlight symmetry</span>
          <Toggle on={r.highlightSymmetry} onChange={(v) => setRules({ highlightSymmetry: v })} ariaLabel="Highlight symmetry" />
        </div>
      </div>
    </>
  );
}
