import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TEMPLATES } from '../model/demo';
import type { TemplateId } from '../model/demo';
import { placeDrawings } from '../model/syntax';
import { keyFifths, keyLabel, keyOptions } from '../model/theory';
import type { Meter, ScaleRef } from '../model/types';
import { generateVariations } from '../model/variations';
import type { GenerateOptions } from '../model/variations';
import { MiniStaff } from '../notation/Staff';
import { SHORTCUTS } from '../shortcuts';
import { audition, createProject, setDrawingNotes, setUi, useApp, useProject } from '../store/store';
import { EditableText, Select, Slider, Toggle } from './ui/Controls';
import { Close, PlayIcon } from './ui/Icons';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

function ModalFrame({ title, children, footer, narrow }: { title: string; children: ReactNode; footer?: ReactNode; narrow?: boolean }) {
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && setUi({ modal: null })}>
      <div className={`modal ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <span className="caps" style={{ fontSize: 13 }}>
            {title}
          </span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => setUi({ modal: null })}>
            <Close />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function Check({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="toggle-row" style={{ cursor: 'pointer', minHeight: 30 }}>
      <span style={{ color: 'var(--text)' }}>{label}</span>
      <Toggle on={on} onChange={set} ariaLabel={label} />
    </label>
  );
}

function VariationsModal({ drawingId }: { drawingId: string }) {
  const project = useProject();
  const pl = placeDrawings(project).find((p) => p.drawing.id === drawingId);
  const [opts, setOpts] = useState<GenerateOptions>({
    preserveCadence: true,
    preserveLength: true,
    preserveRhythm: true,
    preserveScale: true,
    varyContour: true,
    varyIntervals: true,
    distance: 0.37,
  });
  const len = pl ? pl.endTick - pl.startTick : 0;
  const proposals = useMemo(() => (pl ? generateVariations(pl.drawing.notes, len, pl.drawing.scale, opts, 8) : []), [pl, len, opts]);
  if (!pl) return null;
  const d = pl.drawing;
  const fifths = keyFifths(project.key);
  const up = (patch: Partial<GenerateOptions>) => setOpts((o) => ({ ...o, ...patch }));
  return (
    <ModalFrame title={`Generate Variations — Drawing ${d.label}`}>
      <div className="modal-body var-layout">
        <div>
          <div className="insp-caps">Preserve</div>
          <Check label="Cadences" on={opts.preserveCadence} set={(v) => up({ preserveCadence: v })} />
          <Check label="Measure count" on={opts.preserveLength} set={(v) => up({ preserveLength: v })} />
          <Check label="Rhythm" on={opts.preserveRhythm} set={(v) => up({ preserveRhythm: v })} />
          <Check label="Scale" on={opts.preserveScale} set={(v) => up({ preserveScale: v })} />
          <div className="insp-caps" style={{ marginTop: 18 }}>
            Vary
          </div>
          <Check label="Contour" on={opts.varyContour} set={(v) => up({ varyContour: v })} />
          <Check label="Intervals" on={opts.varyIntervals} set={(v) => up({ varyIntervals: v })} />
          <div className="insp-caps" style={{ marginTop: 18 }}>
            Symmetry
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)' }}>
            {d.label} → {d.label}′
          </div>
          <div className="insp-caps" style={{ marginTop: 18 }}>
            Distance from source
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px', alignItems: 'center', gap: 10 }}>
            <Slider value={opts.distance} onChange={(v) => up({ distance: v })} ariaLabel="Distance from source" />
            <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{Math.round(opts.distance * 100)}%</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 18 }}>
            Deterministic proposals — every card lists the exact transformations that produced it. Nothing changes until you choose <b>Use</b>.
          </p>
        </div>
        <div className="var-proposals">
          {proposals.length === 0 && <div style={{ color: 'var(--text-3)', padding: 20 }}>Enable at least one dimension to vary.</div>}
          {proposals.map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, background: 'var(--paper)', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="caps" style={{ fontSize: 11 }}>
                  Proposal {i + 1}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{Math.round(p.distance * 100)}%</span>
                <button type="button" className="icon-btn" aria-label="Play proposal" onClick={() => audition(p.notes)}>
                  <PlayIcon size={14} />
                </button>
              </div>
              <MiniStaff notes={p.notes} fifths={fifths} meter={project.meter} from={0} to={len} width={300} height={62} sp={4.6} showTime={false} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{p.recipe.join(' + ')}</span>
                <button
                  type="button"
                  className="btn"
                  style={{ height: 28 }}
                  onClick={() => {
                    setDrawingNotes(d.id, p.notes);
                    setUi({ modal: null });
                  }}
                >
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalFrame>
  );
}

const METERS: Meter[] = [
  { num: 4, den: 4 },
  { num: 3, den: 4 },
  { num: 2, den: 4 },
  { num: 6, den: 8 },
];

function NewProjectModal({ template: initial }: { template: TemplateId }) {
  const [template, setTemplate] = useState<TemplateId>(initial);
  const [name, setName] = useState('Untitled Study');
  const [key, setKey] = useState<ScaleRef>({ tonic: 0, mode: 'aeolian' });
  const [meter, setMeter] = useState<Meter>({ num: 4, den: 4 });
  const [tempo, setTempo] = useState(112);
  return (
    <ModalFrame
      narrow
      title="New Project"
      footer={
        <>
          <button type="button" className="btn" onClick={() => setUi({ modal: null })}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setUi({ modal: null });
              createProject(template, { name: name.trim() || 'Untitled', key, meter, tempo });
            }}
          >
            Create
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 4 }}>
        <div className="row">
          <span>Name</span>
          <EditableText value={name} onCommit={setName} />
        </div>
        <div className="row">
          <span>Template</span>
          <Select value={template} options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))} onChange={setTemplate} />
        </div>
        <div className="row">
          <span>Key</span>
          <Select value={key} options={keyOptions().map((k) => ({ value: k, label: keyLabel(k) }))} onChange={setKey} />
        </div>
        <div className="row">
          <span>Meter</span>
          <Select value={meter} options={METERS.map((m) => ({ value: m, label: `${m.num}/${m.den}` }))} onChange={setMeter} />
        </div>
        <div className="row">
          <span>Tempo</span>
          <Select value={tempo} options={[72, 84, 96, 100, 112, 120, 132].map((t) => ({ value: t, label: `${t} BPM` }))} onChange={setTempo} />
        </div>
      </div>
    </ModalFrame>
  );
}

function ShortcutsModal() {
  return (
    <ModalFrame narrow title="Keyboard shortcuts">
      <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 13.5 }}>
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <span>
              <kbd>{k}</kbd>
            </span>
            <span style={{ color: 'var(--text-2)' }}>{v}</span>
          </div>
        ))}
      </div>
    </ModalFrame>
  );
}

export function Modals() {
  const modal = useApp((s) => s.modal);
  if (!modal) return null;
  if (modal.kind === 'variations') return <VariationsModal drawingId={modal.drawingId} />;
  if (modal.kind === 'new-project') return <NewProjectModal template={modal.template} />;
  return <ShortcutsModal />;
}

