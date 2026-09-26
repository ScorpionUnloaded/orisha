import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CONTOUR_LABEL, classifyContour, classifyRhythm, classifySymmetry, RHYTHM_LABEL, similarity, SYMMETRY_LABEL, formatPercent } from '../../model/analysis';
import type { RhythmCharacter, SymmetryKind } from '../../model/analysis';
import { CADENCES, CADENCE_ORDER, deriveMembers, placeDrawings, totalBars } from '../../model/syntax';
import { keyOptions, MODE_ORDER, MODES, scaleLabel, tonicNameAscii } from '../../model/theory';
import type { ContourShape } from '../../model/transforms';
import { shapeCurve } from '../../model/transforms';
import type { Drawing, ScaleRef, TransformKind } from '../../model/types';
import {
  addDrawing,
  deleteDrawing,
  setCadence,
  setDrawingContour,
  setDrawingProp,
  setDrawingRhythm,
  setDrawingScale,
  setDrawingSymmetry,
  setDrawingTransform,
  resizeDrawing,
  setUi,
  setProjectMeta,
  setView,
  TRANSFORM_LABEL,
  useApp,
  placeMotifInDrawing,
  useProject,
} from '../../store/store';
import { EditableText, Popover, Select } from '../ui/Controls';
import { Close } from '../ui/Icons';
import { ClosureMeter, InspectorHead, KV, Row } from './Common';
import { NoteEditor } from './NoteEditor';

function ContourGlyph({ shape }: { shape: ContourShape }) {
  const pts = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    return `${6 + t * 44},${27 - shapeCurve(shape, t) * 18}`;
  }).join(' ');
  return (
    <svg width={56} height={34} viewBox="0 0 56 34" aria-hidden>
      <polyline points={pts} fill="none" stroke="#2a2a2c" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function scaleOptions(tonicFrom: ScaleRef) {
  const same = MODE_ORDER.map((mode) => ({ value: { tonic: tonicFrom.tonic, mode } as ScaleRef, label: `${tonicNameAscii({ tonic: tonicFrom.tonic, mode })} ${MODES[mode].scaleName}` }));
  const others = keyOptions()
    .filter((k) => k.tonic !== tonicFrom.tonic)
    .map((k) => ({ value: k.mode === 'aeolian' ? k : k, label: scaleLabel(k) }));
  return [...same, 'sep' as const, ...others];
}

function MotifRef({ drawing }: { drawing: Drawing }) {
  const library = useApp((s) => s.library);
  const project = useProject();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const m = library.find((x) => x.id === drawing.motifRef);
  const candidates = [...project.motifs.map((id) => library.find((x) => x.id === id)!).filter(Boolean), ...library.filter((x) => !project.motifs.includes(x.id))];
  return (
    <>
      <div ref={ref} className="field" style={{ justifyContent: 'space-between', cursor: 'pointer', gap: 6 }} onClick={() => setOpen((o) => !o)} role="button" tabIndex={0}>
        <span style={{ fontStyle: m ? 'normal' : 'italic', color: m ? undefined : 'var(--text-3)' }}>
          {m ? (
            <>
              Motif <i style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: 16 }}>{m.symbol}</i>
            </>
          ) : (
            'None'
          )}
        </span>
        {m && (
          <button
            type="button"
            className="icon-btn"
            style={{ width: 20, height: 20 }}
            aria-label="Unlink motif"
            onClick={(e) => {
              e.stopPropagation();
              setDrawingProp(drawing.id, { motifRef: undefined });
            }}
          >
            <Close size={13} />
          </button>
        )}
      </div>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} minWidth={210}>
        <div className="pop-title">Link to motif</div>
        {candidates.slice(0, 14).map((c) => (
          <button
            key={c.id}
            type="button"
            className="pop-item"
            onClick={() => {
              setOpen(false);
              setDrawingProp(drawing.id, { motifRef: c.id });
            }}
          >
            <span className="check">{c.id === drawing.motifRef ? '✓' : ''}</span>
            {c.name}
          </button>
        ))}
        {m && (
          <>
            <div className="pop-sep" />
            <button
              type="button"
              className="pop-item"
              onClick={() => {
                setOpen(false);
                placeMotifInDrawing(m.id, drawing.id);
              }}
            >
              <span className="check" />
              Replace drawing with {m.name}
            </button>
          </>
        )}
      </Popover>
    </>
  );
}

function DrawingInspector({ drawing, extra }: { drawing: Drawing; extra?: ReactNode }) {
  const project = useProject();
  const placed = placeDrawings(project).find((p) => p.drawing.id === drawing.id)!;
  const contour = classifyContour(drawing.notes);
  const len = placed.endTick - placed.startTick;
  const symmetry = classifySymmetry(drawing.notes, len);
  const rhythm = classifyRhythm(drawing.notes, project.meter);
  const bars = placed.endBar - placed.startBar;

  return (
    <>
      <InspectorHead
        menu={[
          { label: 'Add drawing after', onSelect: () => addDrawing(drawing.id) },
          { label: 'Open in Rhythm Lab', onSelect: () => setView('rhythm') },
          { label: 'Open Period Builder', onSelect: () => setView('period') },
          'sep',
          { label: 'Delete drawing', danger: true, onSelect: () => deleteDrawing(drawing.id) },
        ]}
      />
      {extra}
      <div className="insp-title">Drawing {drawing.label}</div>
      <div className="insp-sub">Melodic unit</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
        <KV k="Start" v={`Bar ${placed.startBar + 1}`} />
        <KV k="End" v={`Bar ${placed.endBar}`} />
        <div className="kv">
          <span>Duration</span>
          <span className="stepper inline" title="Add or remove bars at the end of the drawing (the rhythm is kept)">
            <button type="button" aria-label="One bar shorter" disabled={bars <= 1} onClick={() => resizeDrawing(drawing.id, bars - 1)}>
              −
            </button>
            <span>{`${bars} bar${bars === 1 ? '' : 's'}`}</span>
            <button type="button" aria-label="One bar longer" onClick={() => resizeDrawing(drawing.id, bars + 1)}>
              +
            </button>
          </span>
        </div>
      </div>
      <div className="insp-section">
        <div className="insp-label">Contour</div>
        <div className="row compact" style={{ gridTemplateColumns: '64px 1fr', marginBottom: 4 }}>
          <div className="field" style={{ height: 36, padding: 0, justifyContent: 'center', background: '#e9e8e5' }}>
            <ContourGlyph shape={contour} />
          </div>
          <Select<ContourShape>
            value={contour}
            options={(Object.keys(CONTOUR_LABEL) as ContourShape[]).map((c) => ({ value: c, label: CONTOUR_LABEL[c] }))}
            onChange={(v) => setDrawingContour(drawing.id, v)}
            ariaLabel="Contour"
          />
        </div>
        <Row label="Symmetry">
          <Select<SymmetryKind>
            value={symmetry}
            options={(Object.keys(SYMMETRY_LABEL) as SymmetryKind[]).map((c) => ({ value: c, label: SYMMETRY_LABEL[c] }))}
            onChange={(v) => setDrawingSymmetry(drawing.id, v)}
            ariaLabel="Symmetry"
          />
        </Row>
        <Row label="Transform">
          <Select<TransformKind>
            value={drawing.transform}
            options={(Object.keys(TRANSFORM_LABEL) as TransformKind[]).map((c) => ({ value: c, label: TRANSFORM_LABEL[c] }))}
            onChange={(v) => setDrawingTransform(drawing.id, v)}
            ariaLabel="Transform"
          />
        </Row>
        <Row label="Cadence">
          <Select
            value={drawing.cadence}
            options={CADENCE_ORDER.map((c) => ({ value: c, label: c === 'open' ? 'No cadence' : CADENCES[c].long }))}
            onChange={(v) => setCadence(drawing.id, v)}
            ariaLabel="Cadence"
          />
        </Row>
        <Row label="Scale">
          <Select<ScaleRef> value={drawing.scale} options={scaleOptions(drawing.scale)} onChange={(v) => setDrawingScale(drawing.id, v)} ariaLabel="Scale" />
        </Row>
        <Row label="Rhythm">
          <Select<RhythmCharacter>
            value={rhythm}
            options={(Object.keys(RHYTHM_LABEL) as RhythmCharacter[]).map((c) => ({ value: c, label: RHYTHM_LABEL[c] }))}
            onChange={(v) => setDrawingRhythm(drawing.id, v)}
            ariaLabel="Rhythm"
          />
        </Row>
      </div>
      <div className="insp-section" style={{ marginTop: 8 }}>
        <div className="insp-caps" style={{ marginTop: 10 }}>
          Motif Reference
        </div>
        <Row label="Based on">
          <MotifRef drawing={drawing} />
        </Row>
        <button type="button" className="btn block" style={{ marginTop: 10, background: '#f0efec' }} onClick={() => setUi({ modal: { kind: 'variations', drawingId: drawing.id } })}>
          Apply Transformation…
        </button>
      </div>
    </>
  );
}

function MemberInspector({ id, extra }: { id: string; extra?: ReactNode }) {
  const project = useProject();
  const members = deriveMembers(project);
  const idx = members.findIndex((m) => m.id === id);
  const m = members[idx];
  if (!m) return null;
  const bt = project.meter.num * 480 * (4 / project.meter.den);
  const notesOf = (mm: typeof m) => project.drawings.filter((d) => mm.drawingIds.includes(d.id)).flatMap((d) => {
    const pl = placeDrawings(project).find((p) => p.drawing.id === d.id)!;
    return d.notes.map((n) => ({ ...n, start: n.start + pl.startTick - mm.startBar * bt }));
  });
  const prev = members[idx - 1];
  const sim = prev ? similarity(notesOf(prev), (prev.endBar - prev.startBar) * bt, notesOf(m), (m.endBar - m.startBar) * bt) : null;
  const last = m.drawingIds[m.drawingIds.length - 1];
  return (
    <>
      <InspectorHead menu={[{ label: 'Add drawing to member', onSelect: () => addDrawing(last) }]} />
      {extra}
      <div className="insp-title">{m.name}</div>
      <div className="insp-sub">Phrase member · {m.drawingIds.length} drawing{m.drawingIds.length > 1 ? 's' : ''}</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
        <KV k="Start" v={`Bar ${m.startBar + 1}`} />
        <KV k="End" v={`Bar ${m.endBar}`} />
        <KV k="Duration" v={`${m.endBar - m.startBar} bars`} />
        <KV k="Drawings" v={project.drawings.filter((d) => m.drawingIds.includes(d.id)).map((d) => d.label).join(' · ')} />
      </div>
      <div className="insp-section">
        <div className="insp-caps">Rest Point</div>
        <ClosureMeter value={CADENCES[m.cadence].closure} label={CADENCES[m.cadence].long} />
        <Row label="Cadence">
          <Select value={m.cadence} options={CADENCE_ORDER.map((c) => ({ value: c, label: CADENCES[c].long }))} onChange={(v) => setCadence(last, v)} ariaLabel="Member cadence" />
        </Row>
        <Row label="Member key">
          <Select
            value={m.key}
            options={Array.from(new Set(project.drawings.map((d) => d.member))).map((k) => ({ value: k, label: `Member ${k}` }))}
            onChange={(v) => m.drawingIds.forEach((d) => setDrawingProp(d, { member: v }))}
            ariaLabel="Member"
          />
        </Row>
      </div>
      {sim && (
        <div className="insp-section">
          <div className="insp-caps">Compared with {prev.name}</div>
          <KV k="Contour" v={formatPercent(sim.contour)} />
          <KV k="Rhythm" v={formatPercent(sim.rhythm)} />
          <KV k="Intervals" v={formatPercent(sim.interval)} />
          <KV k="Durations" v={formatPercent(sim.duration)} />
        </div>
      )}
    </>
  );
}

function PeriodSummary({ extra }: { extra?: ReactNode }) {
  const project = useProject();
  const members = deriveMembers(project);
  return (
    <>
      <InspectorHead />
      {extra}
      <div className="insp-title">{project.periodName}</div>
      <div className="insp-sub">Phrase architecture</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
        <KV k="Form" v={project.form} />
        <KV k="Length" v={`${totalBars(project)} bars`} />
        <KV k="Members" v={members.length} />
        <KV k="Drawings" v={project.drawings.length} />
      </div>
      <div className="insp-section">
        <div className="insp-caps">Form label</div>
        <EditableText value={project.form} onCommit={(v) => setProjectMeta({ form: v })} />
        <button type="button" className="btn block" style={{ marginTop: 14 }} onClick={() => setView('period')}>
          Open Period Builder
        </button>
      </div>
    </>
  );
}

export function ComposerInspector() {
  const project = useProject();
  const selection = useApp((s) => s.selection);
  const hasNotes = useApp((s) => s.noteSel.length > 0);
  // Selected notes come first: they are what the keyboard and the editors act on.
  const extra = hasNotes ? (
    <div className="note-section">
      <NoteEditor />
    </div>
  ) : null;
  if (selection.kind === 'drawing') {
    const d = project.drawings.find((x) => x.id === selection.id);
    if (d) return <DrawingInspector drawing={d} extra={extra} />;
  }
  if (selection.kind === 'member') return <MemberInspector id={selection.id} extra={extra} />;
  return <PeriodSummary extra={extra} />;
}
