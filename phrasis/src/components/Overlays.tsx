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
import { arpeggiate, chop, limitRange, quantizeNotes, randomize, strum, transpose, velocities } from '../model/editing';
import type { ArpPattern, VelocityOp } from '../model/editing';
import { prettyPitch } from '../model/theory';
import { T16, T8, TPQ } from '../model/types';
import { SHORTCUT_SECTIONS } from '../shortcuts';
import { audition, createProject, currentProject, runTool, scaleAtFor, selectedDrawing, setDrawingNotes, setUi, targetIds, useApp, useProject } from '../store/store';
import type { NoteToolId } from '../store/store';
import { snapLabel, snapOptions } from './EditTools';
import { NoteEditor } from './inspector/NoteEditor';
import { EditableText, Segmented, Select, Slider, Toggle } from './ui/Controls';
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
    <ModalFrame title="Keyboard shortcuts">
      <div className="modal-body shortcut-grid">
        {SHORTCUT_SECTIONS.map((sec) => (
          <section key={sec.title}>
            <div className="insp-caps">{sec.title}</div>
            <div className="shortcut-list">
              {sec.items.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <span>
                    <kbd>{k}</kbd>
                  </span>
                  <span style={{ color: 'var(--text-2)' }}>{v}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ModalFrame>
  );
}

function NotePropsModal() {
  const count = useApp((s) => s.noteSel.length);
  return (
    <ModalFrame narrow title="Note properties" footer={<button type="button" className="btn primary" onClick={() => setUi({ modal: null })}>Done</button>}>
      <div className="modal-body">{count ? <NoteEditor /> : <p style={{ color: 'var(--text-3)' }}>No notes selected.</p>}</div>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Note tools with parameters (FL-style tool dialogs)

const TOOL_TITLE: Record<NoteToolId, string> = {
  quantize: 'Quantize',
  randomize: 'Randomize / humanize',
  strum: 'Strum',
  arpeggiate: 'Arpeggiate',
  velocity: 'Velocity',
  limit: 'Limit to range',
  transpose: 'Transpose',
  chop: 'Chop',
};

const PITCH_CHOICES = Array.from({ length: 61 }, (_, i) => 36 + i);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function NoteToolModal({ tool }: { tool: NoteToolId }) {
  const s = useApp.getState();
  const project = useProject();
  const meter = project.meter;
  const [grid, setGrid] = useState(Math.max(T16 / 2, s.snap));
  const [strength, setStrength] = useState(1);
  const [ends, setEnds] = useState(true);
  const [step, setStep] = useState(tool === 'strum' ? 30 : T16);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const [pattern, setPattern] = useState<ArpPattern>('up');
  const [velMode, setVelMode] = useState<VelocityOp['kind']>('ramp');
  const [velA, setVelA] = useState(56);
  const [velB, setVelB] = useState(110);
  const [lo, setLo] = useState(60);
  const [hi, setHi] = useState(79);
  const [rv, setRv] = useState(12);
  const [rt, setRt] = useState(15);
  const [rp, setRp] = useState(0);
  const [amount, setAmount] = useState(2);
  const [mode, setMode] = useState<'diatonic' | 'chromatic'>('diatonic');
  const ids = targetIds(s);
  const drawing = selectedDrawing(s);
  const scope = s.noteSel.length ? `${ids.length} selected note${ids.length === 1 ? '' : 's'}` : drawing ? `all ${ids.length} notes of drawing ${drawing.label}` : 'no notes';
  const grids = snapOptions(meter).filter((o) => o.value > 1);
  const apply = () => {
    const p = currentProject();
    switch (tool) {
      case 'quantize':
        runTool((n, x) => quantizeNotes(n, x, grid, { ends, strength }), `Quantized to ${snapLabel(grid, meter)}`);
        break;
      case 'chop':
        runTool((n, x) => chop(n, x, grid), 'Chopped');
        break;
      case 'strum':
        runTool((n, x) => strum(n, x, step, dir), 'Strummed');
        break;
      case 'arpeggiate':
        runTool((n, x) => arpeggiate(n, x, step, pattern), 'Arpeggiated');
        break;
      case 'velocity': {
        const op: VelocityOp = velMode === 'set' ? { kind: 'set', value: velA } : velMode === 'scale' ? { kind: 'scale', factor: velA / 100 } : velMode === 'add' ? { kind: 'add', delta: velA - 64 } : { kind: 'ramp', from: velA, to: velB };
        runTool((n, x) => velocities(n, x, op), 'Velocities changed');
        break;
      }
      case 'limit':
        runTool((n, x) => limitRange(n, x, lo, hi), 'Limited to range');
        break;
      case 'randomize':
        runTool((n, x) => randomize(n, x, { velocity: rv, timing: rt, pitch: rp, scaleAt: scaleAtFor(p) }, Date.now() & 0xffffff), 'Randomized');
        break;
      case 'transpose':
        runTool((n, x) => transpose(n, x, amount, mode, scaleAtFor(p)), `Transposed ${amount > 0 ? '+' : ''}${amount}`);
        break;
    }
    setUi({ modal: null });
  };

  let body: ReactNode = null;
  switch (tool) {
    case 'quantize':
    case 'chop':
      body = (
        <>
          <Field label="Grid">
            <Select value={grid} options={grids} onChange={setGrid} ariaLabel="Grid" />
          </Field>
          {tool === 'quantize' && (
            <>
              <Field label="Strength">
                <div className="vel-row">
                  <Slider value={strength} onChange={setStrength} ariaLabel="Strength" />
                  <span>{Math.round(strength * 100)}%</span>
                </div>
              </Field>
              <label className="toggle-row">
                <span>Quantize note ends too</span>
                <Toggle on={ends} onChange={setEnds} ariaLabel="Quantize ends" />
              </label>
            </>
          )}
        </>
      );
      break;
    case 'strum':
    case 'arpeggiate':
      body = (
        <>
          <Field label={tool === 'strum' ? 'Offset per note' : 'Step'}>
            <Select
              value={step}
              options={
                tool === 'strum'
                  ? [
                      { value: 10, label: 'Very tight (10 ticks)' },
                      { value: 30, label: '1/64' },
                      { value: 60, label: '1/32' },
                      { value: T16, label: '1/16' },
                    ]
                  : [
                      { value: T16 / 2, label: '1/32' },
                      { value: T16, label: '1/16' },
                      { value: TPQ / 3, label: '1/8 triplet' },
                      { value: T8, label: '1/8' },
                      { value: TPQ, label: '1/4' },
                    ]
              }
              onChange={setStep}
              ariaLabel="Step"
            />
          </Field>
          {tool === 'strum' ? (
            <Field label="Direction">
              <Segmented value={dir} onChange={setDir} options={[{ value: 'up', label: 'Up (low first)' }, { value: 'down', label: 'Down' }]} />
            </Field>
          ) : (
            <Field label="Pattern">
              <Segmented value={pattern} onChange={setPattern} options={[{ value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'updown', label: 'Up–down' }]} />
            </Field>
          )}
          <p className="modal-note">Works on chords — notes that start together.</p>
        </>
      );
      break;
    case 'velocity':
      body = (
        <>
          <Field label="Mode">
            <Segmented value={velMode} onChange={setVelMode} options={[{ value: 'ramp', label: 'Ramp' }, { value: 'set', label: 'Set' }, { value: 'scale', label: 'Scale' }, { value: 'add', label: 'Add' }]} />
          </Field>
          <Field label={velMode === 'ramp' ? 'From' : velMode === 'scale' ? 'Percent' : velMode === 'add' ? 'Amount' : 'Velocity'}>
            <div className="vel-row">
              <Slider value={velA} min={velMode === 'scale' ? 10 : 1} max={velMode === 'scale' ? 200 : 127} step={1} onChange={setVelA} ariaLabel="Value" />
              <span>{velMode === 'scale' ? `${velA}%` : velMode === 'add' ? `${velA - 64 > 0 ? '+' : ''}${velA - 64}` : velA}</span>
            </div>
          </Field>
          {velMode === 'ramp' && (
            <Field label="To">
              <div className="vel-row">
                <Slider value={velB} min={1} max={127} step={1} onChange={setVelB} ariaLabel="To" />
                <span>{velB}</span>
              </div>
            </Field>
          )}
          <p className="modal-note">A ramp from soft to loud is a crescendo; loud to soft a decrescendo.</p>
        </>
      );
      break;
    case 'limit':
      body = (
        <>
          <Field label="Lowest">
            <Select value={lo} options={PITCH_CHOICES.map((p) => ({ value: p, label: prettyPitch(p, 0) }))} onChange={setLo} ariaLabel="Lowest" />
          </Field>
          <Field label="Highest">
            <Select value={hi} options={PITCH_CHOICES.map((p) => ({ value: p, label: prettyPitch(p, 0) }))} onChange={setHi} ariaLabel="Highest" />
          </Field>
          <p className="modal-note">Notes outside the range are folded in by octaves (at least an octave is kept).</p>
        </>
      );
      break;
    case 'randomize':
      body = (
        <>
          <Field label="Velocity ±">
            <div className="vel-row">
              <Slider value={rv} min={0} max={40} step={1} onChange={setRv} ariaLabel="Velocity amount" />
              <span>{rv}</span>
            </div>
          </Field>
          <Field label="Timing ±">
            <div className="vel-row">
              <Slider value={rt} min={0} max={60} step={1} onChange={setRt} ariaLabel="Timing amount" />
              <span>{rt}</span>
            </div>
          </Field>
          <Field label="Pitch ± steps">
            <div className="vel-row">
              <Slider value={rp} min={0} max={3} step={1} onChange={setRp} ariaLabel="Pitch amount" />
              <span>{rp}</span>
            </div>
          </Field>
          <p className="modal-note">Timing is in ticks (480 per quarter). Pitch moves stay in the drawing's scale.</p>
        </>
      );
      break;
    case 'transpose':
      body = (
        <>
          <Field label="Interval">
            <Segmented value={mode} onChange={setMode} options={[{ value: 'diatonic', label: 'Scale steps' }, { value: 'chromatic', label: 'Semitones' }]} />
          </Field>
          <Field label="Amount">
            <div className="stepper">
              <button type="button" onClick={() => setAmount((a) => Math.max(-24, a - 1))} aria-label="Less">
                −
              </button>
              <span>{`${amount > 0 ? '+' : ''}${amount}`}</span>
              <button type="button" onClick={() => setAmount((a) => Math.min(24, a + 1))} aria-label="More">
                +
              </button>
            </div>
          </Field>
          <p className="modal-note">{mode === 'diatonic' ? 'Scale steps follow each drawing’s scale (7 steps = an octave).' : '12 semitones = an octave.'}</p>
        </>
      );
      break;
  }

  return (
    <ModalFrame
      narrow
      title={TOOL_TITLE[tool]}
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: 12.5, color: 'var(--text-3)' }}>Applies to {scope}</span>
          <button type="button" className="btn" onClick={() => setUi({ modal: null })}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!ids.length} onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 4 }}>
        {body}
      </div>
    </ModalFrame>
  );
}

export function Modals() {
  const modal = useApp((s) => s.modal);
  if (!modal) return null;
  if (modal.kind === 'variations') return <VariationsModal drawingId={modal.drawingId} />;
  if (modal.kind === 'new-project') return <NewProjectModal template={modal.template} />;
  if (modal.kind === 'note-props') return <NotePropsModal />;
  if (modal.kind === 'note-tool') return <NoteToolModal tool={modal.tool} />;
  return <ShortcutsModal />;
}

