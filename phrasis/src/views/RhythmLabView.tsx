import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';
import { densityFingerprint } from '../model/analysis';
import { DEFAULT_RHYTHM as DEFAULTS } from '../model/demo';
import { cadencePoints, totalBars } from '../model/syntax';
import { metricWeight } from '../model/transforms';
import { LANES, T16, T8 } from '../model/types';
import type { Lane, Meter, Note, Project, RhythmSettings } from '../model/types';
import { Staff } from '../notation/Staff';
import type { EngraveOptions, StaffGeometry } from '../notation/layout';
import { InspectorHead, Row } from '../components/inspector/Common';
import { Panel, VIEW_ITEMS } from '../components/Panel';
import { BarNumbers, Playhead, SyntaxBrackets, useAxis } from '../components/Timeline';
import type { Axis } from '../components/Timeline';
import { MenuButton, Segmented, Select, Slider } from '../components/ui/Controls';
import { BarsIcon, Waveform } from '../components/ui/Icons';
import { useSize } from '../components/useSize';
import {
  applyRhythmPipeline,
  audition,
  extractRhythmFromSelection,
  selectNotes,
  setRhythm,
  setUi,
  toggleStep,
  useApp,
  useProject,
} from '../store/store';
import { useViewNotes, useWindow } from './ComposerView';

const RL_GUTTER = 92;

/** Which percussive lane a melodic onset maps to. */
export function laneOf(tick: number, meter: Meter): Lane {
  const w = metricWeight(tick, meter);
  if (w >= 0.8) return 'kick';
  if (w >= 0.6) return 'snare';
  if (w >= 0.35) return 'hihat';
  return 'other';
}

const LANE_POS: Record<Lane, { pos: number; x: boolean }> = {
  kick: { pos: 1, x: false },
  snare: { pos: 5, x: false },
  hihat: { pos: 7, x: true },
  other: { pos: 3, x: true },
};

const LANE_LABEL: Record<Lane, string> = { hihat: 'Hi-Hat', snare: 'Snare', kick: 'Kick', other: 'Other' };

function useSelectedDrawingId() {
  return useApp((s) => (s.selection.kind === 'drawing' ? s.selection.id : undefined));
}

function accentWeight(tick: number, meter: Meter, accent: RhythmSettings['accent']) {
  const w = metricWeight(tick, meter);
  if (accent === 'downbeat') return w;
  if (accent === 'backbeat') return w === 0.6 ? 1 : w >= 0.8 ? 0.6 : w;
  return w === 0.35 ? 1 : w >= 0.6 ? 0.4 : w;
}

// ---------------------------------------------------------------------------

function LabStaff({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
  const selectedId = useSelectedDrawingId();
  const noteSel = useApp((s) => s.noteSel);
  const view = useViewNotes(project, axis);
  const notes = useMemo(() => view.map((n) => ({ ...n, slur: undefined })), [view]);
  const total = totalBars(project) * axis.barLen;
  const sp = 8.5;
  const top = Math.max(54, (height - 36) / 2 + 12);
  const opts = useMemo<EngraveOptions>(
    () => ({
      clef: 'percussion',
      fifths: 0,
      meter: project.meter,
      from: axis.startTick,
      to: axis.endTick,
      percussion: (n: Note) => {
        const l = LANE_POS[laneOf(n.start, project.meter)];
        return { positions: [l.pos], x: [l.x] };
      },
    }),
    [project.meter, axis.startTick, axis.endTick],
  );
  const geo = useMemo<StaffGeometry>(() => ({ sp, top, left: 10, right: axis.x1, preludeX: 10, showKey: false, finalBar: axis.endTick >= total }), [top, axis.x1, axis.endTick, total]);
  const sel = useMemo(() => new Set(noteSel), [noteSel]);
  const classOf = useCallback((id: string | undefined) => (id && sel.has(id) ? 'sel' : undefined), [sel]);
  return (
    <svg className="svg-fill" onPointerDown={() => selectNotes([])}>
      <SyntaxBrackets project={project} axis={axis} y={32} bottom={height - 6} prefix="Pattern" cadenceLabel="plain" selectedId={selectedId} showTint={false} />
      <Staff
        notes={notes as Note[]}
        opts={opts}
        geo={geo}
        xOf={axis.xOf}
        classOf={classOf}
        onNoteDown={(id, e) => {
          selectNotes([id], e.shiftKey || e.metaKey);
          const n = notes.find((x) => x.id === id);
          if (n) audition([{ ...n, start: 0, dur: Math.min(n.dur, 400) }]);
        }}
      />
      <Playhead axis={axis} top={24} bottom={height - 6} />
    </svg>
  );
}

function OnsetPattern({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
  const selectedId = useSelectedDrawingId();
  const noteSel = useApp((s) => s.noteSel);
  const notes = useViewNotes(project, axis);
  const r = project.rhythm;
  const y = Math.max(62, (height - 24) / 2 + 18);
  const sub = r.subdivision === '8' ? T8 : T16;
  const els: ReactElement[] = [];
  // Start marker
  els.push(<line key="m1" x1={axis.x0 - 26} x2={axis.x0 - 26} y1={y - 16} y2={y + 16} stroke="#2a2a2c" strokeWidth={2.4} />);
  els.push(<line key="m2" x1={axis.x0 - 20} x2={axis.x0 - 20} y1={y - 16} y2={y + 16} stroke="#2a2a2c" strokeWidth={1} />);
  els.push(<line key="base" x1={axis.x0 - 10} x2={axis.x1} y1={y} y2={y} stroke="#d4d2cd" />);
  for (let t = axis.startTick; t < axis.endTick; t += sub) {
    const x = axis.xOf(t);
    const isBar = t % axis.barLen === 0;
    if (isBar) els.push(<line key={`b${t}`} x1={x} x2={x} y1={y - 22} y2={y + 30} stroke="#d9d7d3" />);
    if (!notes.some((n) => n.abs === t)) els.push(<circle key={`g${t}`} cx={x} cy={y} r={2.6} fill="#d0cfcb" />);
  }
  // Pulse grouping underlines
  const grouping = r.grouping === 'auto' ? (project.meter.num % 3 === 0 && project.meter.den === 8 ? [3, 3] : project.meter.num === 4 ? [4, 4] : [project.meter.num * 2]) : r.grouping.split('+').map(Number);
  const eighth = T8;
  for (let bar = axis.startBar; bar < axis.startBar + axis.bars; bar++) {
    let t = bar * axis.barLen;
    grouping.forEach((g, gi) => {
      const x1 = axis.xOf(t) + 3;
      const x2 = axis.xOf(t + g * eighth) - 3;
      els.push(<path key={`gr${bar}-${gi}`} d={`M${x1},${y + 14} q0,5 5,5 H${x2 - 5} q5,0 5,-5`} fill="none" stroke="#c9c7c2" strokeWidth={1} />);
      t += g * eighth;
    });
  }
  const sel = new Set(noteSel);
  for (const n of notes) {
    if (n.abs < axis.startTick || n.abs >= axis.endTick) continue;
    const x = axis.xOf(n.abs);
    const accent = n.art === 'accent';
    const color = sel.has(n.id) ? 'var(--blue)' : accent ? 'var(--orange)' : '#1d1d1f';
    els.push(
      <g key={n.id} style={{ cursor: 'pointer' }} onPointerDown={(e) => {
        e.stopPropagation();
        selectNotes([n.id], e.shiftKey || e.metaKey);
        audition([{ ...n, start: 0, dur: Math.min(n.dur, 300) }]);
      }}>
        <circle cx={x} cy={y} r={4.6} fill={color} />
        {n.dur >= axis.barLen / 4 && <line x1={x + 6} x2={Math.min(axis.x1, axis.xOf(n.abs + n.dur)) - 4} y1={y} y2={y} stroke={color} strokeWidth={1.4} opacity={0.35} />}
        {accent && (
          <text x={x} y={y - 12} textAnchor="middle" fontSize={13} fill="var(--orange)">
            {'>'}
          </text>
        )}
      </g>,
    );
  }
  return (
    <svg className="svg-fill" onPointerDown={() => selectNotes([])}>
      <SyntaxBrackets project={project} axis={axis} y={32} bottom={height - 24} prefix="Pattern" cadenceLabel="plain" selectedId={selectedId} showTint={false} />
      {els}
      <BarNumbers axis={axis} y={height - 12} />
      <Playhead axis={axis} top={24} bottom={height - 24} />
    </svg>
  );
}

function Density({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
  const selectedId = useSelectedDrawingId();
  const noteSel = useApp((s) => s.noteSel);
  const notes = useViewNotes(project, axis);
  const r = project.rhythm;
  const step = r.subdivision === '8' ? T8 : T16;
  const cells = useMemo(() => densityFingerprint(notes as Note[], axis.startTick, axis.endTick, step, project.meter), [notes, axis.startTick, axis.endTick, step, project.meter]);
  const cads = new Set(cadencePoints(project).map((c) => c.arrival));
  const byId = new Map(notes.map((n) => [n.id, n]));
  const top = 46;
  const bottom = height - 30;
  const h = bottom - top;
  const sel = new Set(noteSel);
  const w = Math.max(2, (axis.xOf(axis.startTick + step) - axis.x0) * 0.72);
  return (
    <svg className="svg-fill">
      <SyntaxBrackets project={project} axis={axis} y={32} bottom={bottom} prefix="Pattern" cadenceLabel="plain" selectedId={selectedId} showTint={false} cadTop={32} />
      {[1, 0.5, 0].map((v) => (
        <g key={v}>
          <text x={axis.x0 - 14} y={bottom - v * h + 4} textAnchor="end" className="axis-label" fontSize={12}>
            {v.toFixed(1)}
          </text>
          <line x1={axis.x0 - 6} x2={axis.x1} y1={bottom - v * h} y2={bottom - v * h} stroke={v === 0 ? '#cfcdc9' : '#e4e2de'} />
        </g>
      ))}
      {cells.map((c, i) => {
        const t = axis.startTick + i * step;
        const n = c.noteId ? byId.get(c.noteId) : undefined;
        const weight = c.onset ? Math.min(1, c.value * (0.85 + 0.3 * accentWeight(t, project.meter, r.accent))) : c.value;
        const color = c.onset && n && sel.has(n.id) ? 'var(--bracket-blue)' : c.onset && n && (n.art === 'accent' || cads.has(n.abs)) ? 'var(--orange)' : c.onset ? '#a3a3a7' : '#cdcccb';
        const bh = Math.max(2, weight * h * (c.onset ? 1 : 0.9) * (0.45 + 0.55 * Math.min(1, r.sensitivity + 0.25)));
        return <rect key={i} x={axis.xOf(t) + 1} y={bottom - bh} width={w} height={bh} fill={color} />;
      })}
      <BarNumbers axis={axis} y={height - 10} />
      <Playhead axis={axis} top={30} bottom={bottom} />
    </svg>
  );
}

function StepGrid({ project, axis, height }: { project: Project; axis: Axis; height: number }) {
  const selectedId = useSelectedDrawingId();
  const playhead = useApp((s) => s.playhead);
  const playing = useApp((s) => s.playing);
  const steps = project.steps;
  const stepTicks = axis.barLen / steps.perBar;
  const top = 38;
  const rowH = Math.max(12, Math.min(24, (height - top - 24) / 4));
  const labelX = 20;
  const first = Math.round(axis.startTick / stepTicks);
  const last = Math.round(axis.endTick / stepTicks);
  const currentStep = playing ? Math.floor(playhead / stepTicks) : -1;
  const els: ReactElement[] = [];
  const cw = axis.xOf(axis.startTick + stepTicks) - axis.x0;
  const beatSteps = steps.perBar / project.meter.num;
  LANES.forEach((lane, li) => {
    const y = top + li * rowH;
    els.push(
      <text key={`l${lane}`} x={labelX} y={y + rowH / 2 + 5} fontSize={14} fill="var(--text)">
        {LANE_LABEL[lane]}
      </text>,
    );
    for (let i = first; i < last; i++) {
      const x = axis.xOf(i * stepTicks);
      const beatIdx = Math.floor(i / beatSteps);
      const shade = (beatIdx + li) % 2 === 0 ? '#ebeae7' : '#f3f2ef';
      const v = steps.lanes[lane][i] ?? 0;
      const cx = x + cw / 2;
      const cy = y + rowH / 2;
      const isCur = i === currentStep;
      const col = isCur && v ? 'var(--bracket-blue)' : v === 3 ? 'var(--orange)' : v === 2 ? '#1f1f21' : '#bdbcb9';
      els.push(
        <g key={`${lane}${i}`} onPointerDown={() => toggleStep(lane, i)} style={{ cursor: 'pointer' }}>
          <rect x={x + 0.5} y={y + 0.5} width={cw - 1} height={rowH - 1} fill={shade} />
          {v > 0 &&
            (lane === 'hihat' ? (
              <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize={v >= 2 ? 13 : 12} fontWeight={v >= 2 ? 600 : 400} fill={v === 1 ? '#8f8f93' : col}>
                {v === 3 ? '●' : '×'}
              </text>
            ) : (
              <circle cx={cx} cy={cy} r={v === 1 ? 3.2 : 4.8} fill={v === 1 ? '#c4c3c0' : col} />
            ))}
        </g>,
      );
    }
  });
  return (
    <svg className="svg-fill">
      <SyntaxBrackets project={project} axis={axis} y={29} bottom={top + rowH * 4} prefix="Pattern" cadenceLabel="plain" selectedId={selectedId} showTint={false} cadTop={29} />
      {els}
      {cadencePoints(project).map((c) => {
        const x = axis.xOf(c.arrival);
        return x >= axis.x0 && x <= axis.x1 ? <line key={c.drawingId} x1={x} x2={x} y1={30} y2={top + rowH * 4} className="cad-line" pointerEvents="none" /> : null;
      })}
      <BarNumbers axis={axis} y={top + rowH * 4 + 16} />
      <Playhead axis={axis} top={top} bottom={top + rowH * 4} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

type Focus = 'staff' | 'onsets' | 'density' | 'pattern';

export function RhythmLabView() {
  const project = useProject();
  const focus = useApp((s) => s.rhythmShow);
  const win = useWindow();
  const [ref1, s1] = useSize<HTMLDivElement>();
  const [ref2, s2] = useSize<HTMLDivElement>();
  const [ref3, s3] = useSize<HTMLDivElement>();
  const [ref4, s4] = useSize<HTMLDivElement>();
  const axis = useAxis(project, s1.width || s4.width, win, RL_GUTTER, 18);
  const flex = (f: Focus) => ({ flex: focus === f ? '1.12 1 0' : '1 1 0' });
  const menu = (title: string) => [
    { title },
    { label: 'Extract rhythm from selection', onSelect: extractRhythmFromSelection },
    { label: 'Apply rhythm to selection', onSelect: applyRhythmPipeline },
  ];
  const panels: Array<{ id: Focus; title: string; ref: (el: HTMLDivElement | null) => void; size: { width: number; height: number }; body: (h: number) => ReactElement }> = [
    { id: 'staff', title: 'Rhythmic Staff', ref: ref1, size: s1, body: (h) => <LabStaff project={project} axis={axis} height={h} /> },
    { id: 'onsets', title: 'Onset Pattern', ref: ref2, size: s2, body: (h) => <OnsetPattern project={project} axis={axis} height={h} /> },
    { id: 'density', title: 'Density Fingerprint', ref: ref3, size: s3, body: (h) => <Density project={project} axis={axis} height={h} /> },
    { id: 'pattern', title: 'Step Grid', ref: ref4, size: s4, body: (h) => <StepGrid project={project} axis={axis} height={h} /> },
  ];
  return (
    <div className="center rhythm">
      <div className="panel-head" style={{ height: 54, borderBottom: '1px solid var(--line)', flex: 'none' }}>
        <span className="caps" style={{ fontSize: 17, letterSpacing: '0.24em' }}>
          Rhythm Lab
        </span>
        <span className="spacer" />
        <span className="show-label">Show:</span>
        <Segmented<Focus>
          value={focus}
          onChange={(v) => setUi({ rhythmShow: v })}
          options={[
            { value: 'staff', label: 'Staff' },
            { value: 'onsets', label: 'Onsets' },
            { value: 'density', label: 'Density' },
            { value: 'pattern', label: 'Pattern' },
          ]}
        />
        <MenuButton items={VIEW_ITEMS('rhythm')} label="Rhythm Lab options" />
      </div>
      {panels.map((p) => (
        <Panel key={p.id} title={p.title} style={flex(p.id)} className="lab-panel" menu={menu(p.title)} onHeadClick={() => setUi({ rhythmShow: p.id })}>
          <div ref={p.ref} style={{ position: 'absolute', inset: 0 }}>
            {p.size.width > 0 && p.size.height > 0 && p.body(p.size.height)}
          </div>
        </Panel>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RhythmInspector() {
  const project = useProject();
  const r = project.rhythm;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <>
      <InspectorHead
        menu={[
          { label: 'Reset rhythm settings', onSelect: () => (Object.keys(DEFAULTS) as Array<keyof RhythmSettings>).forEach((k) => setRhythm(k, DEFAULTS[k] as never)) },
        ]}
      />
      <div className="insp-title">Rhythm Lab</div>
      <div className="insp-sub">Rhythmic analysis and transformation</div>

      <div className="insp-section">
        <div className="insp-caps">Extract Rhythm</div>
        <button type="button" className="btn block" onClick={extractRhythmFromSelection} style={{ marginBottom: 6 }}>
          <Waveform size={18} /> Extract from Selection
        </button>
        <Row label="Source" compact>
          <Select<RhythmSettings['source']> size="sm" value={r.source} options={[{ value: 'melody', label: 'Melody' }, { value: 'pattern', label: 'Step pattern' }]} onChange={(v) => setRhythm('source', v)} />
        </Row>
        <Row label="Quantize Input" compact>
          <Select<RhythmSettings['quantizeInput']>
            size="sm"
            value={r.quantizeInput}
            options={[
              { value: 'auto', label: 'Auto (1/16)' },
              { value: '8', label: '1/8' },
              { value: '16', label: '1/16' },
            ]}
            onChange={(v) => setRhythm('quantizeInput', v)}
          />
        </Row>
        <div className="slider-row">
          <span>Sensitivity</span>
          <Slider value={r.sensitivity} onChange={(v) => setRhythm('sensitivity', v)} ariaLabel="Sensitivity" />
          <span>{pct(r.sensitivity)}</span>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-caps">Apply Rhythm</div>
        <Row label="Target" compact>
          <Select<RhythmSettings['target']>
            size="sm"
            value={r.target}
            options={[
              { value: 'selected', label: 'Selected Notes' },
              { value: 'drawing', label: 'Selected Drawing' },
              { value: 'member', label: 'Whole Member' },
              { value: 'period', label: 'Whole Period' },
            ]}
            onChange={(v) => setRhythm('target', v)}
          />
        </Row>
        <Row label="Mode" compact>
          <Select<RhythmSettings['mode']>
            size="sm"
            value={r.mode}
            options={[
              { value: 'replace-durations', label: 'Replace Durations' },
              { value: 'replace-onsets', label: 'Replace Onsets' },
              { value: 'accents-only', label: 'Accents Only' },
            ]}
            onChange={(v) => setRhythm('mode', v)}
          />
        </Row>
        <div className="slider-row">
          <span>Strength</span>
          <Slider value={r.strength} onChange={(v) => setRhythm('strength', v)} ariaLabel="Apply strength" />
          <span>{pct(r.strength)}</span>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-caps">Quantize</div>
        <Row label="Grid" compact>
          <Select<RhythmSettings['grid']>
            size="sm"
            value={r.grid}
            options={[
              { value: '4', label: '1/4' },
              { value: '8', label: '1/8' },
              { value: '16', label: '1/16' },
              { value: '32', label: '1/32' },
            ]}
            onChange={(v) => setRhythm('grid', v)}
          />
        </Row>
        <div className="slider-row">
          <span>Strength</span>
          <Slider value={r.quantizeStrength} onChange={(v) => setRhythm('quantizeStrength', v)} ariaLabel="Quantize strength" />
          <span>{pct(r.quantizeStrength)}</span>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-caps">Swing</div>
        <div className="slider-row">
          <span>Amount</span>
          <Slider value={r.swing} max={0.6} onChange={(v) => setRhythm('swing', v)} ariaLabel="Swing amount" />
          <span>{pct(r.swing)}</span>
        </div>
        <Row label="Feel" compact>
          <Select<RhythmSettings['swingFeel']>
            size="sm"
            value={r.swingFeel}
            options={[
              { value: 'eighth', label: 'Eighth-Note' },
              { value: 'sixteenth', label: 'Sixteenth-Note' },
            ]}
            onChange={(v) => setRhythm('swingFeel', v)}
          />
        </Row>
      </div>

      <div className="insp-section">
        <div className="insp-caps">Pulse Grouping</div>
        <Row label="Grouping" compact>
          <Select<RhythmSettings['grouping']>
            size="sm"
            value={r.grouping}
            options={[
              { value: 'auto', label: `Auto (${project.meter.num === 4 && project.meter.den === 4 ? '4+4' : `${project.meter.num * (8 / project.meter.den)}`})` },
              { value: '4+4', label: '4+4' },
              { value: '3+3+2', label: '3+3+2' },
              { value: '3+2+3', label: '3+2+3' },
              { value: '2+2+2+2', label: '2+2+2+2' },
            ]}
            onChange={(v) => setRhythm('grouping', v)}
          />
        </Row>
        <Row label="Subdivision" compact>
          <Select<RhythmSettings['subdivision']>
            size="sm"
            value={r.subdivision}
            options={[
              { value: '8', label: '1/8' },
              { value: '16', label: '1/16' },
            ]}
            onChange={(v) => setRhythm('subdivision', v)}
          />
        </Row>
        <Row label="Accent" compact>
          <Select<RhythmSettings['accent']>
            size="sm"
            value={r.accent}
            options={[
              { value: 'downbeat', label: 'Downbeat' },
              { value: 'backbeat', label: 'Backbeat' },
              { value: 'offbeat', label: 'Offbeat' },
            ]}
            onChange={(v) => setRhythm('accent', v)}
          />
        </Row>
      </div>
      <button type="button" className="btn block" style={{ height: 44, marginTop: 12 }} onClick={applyRhythmPipeline}>
        <BarsIcon size={20} /> Apply to Selection
      </button>
    </>
  );
}

