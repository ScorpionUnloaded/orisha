import { useMemo } from 'react';
import { scaleAtTick } from '../../model/syntax';
import { keyFifths, keyLabel, prettyPitch, romanDegree } from '../../model/theory';
import { T16, TPQ } from '../../model/types';
import type { Articulation } from '../../model/types';
import {
  deleteNotes,
  duplicateNotes,
  moveNotes,
  patchNotes,
  periodNotes,
  setUi,
  transposeNotes,
  useApp,
  useProject,
} from '../../store/store';
import { LENGTHS, lengthLabel } from '../EditTools';
import { Segmented, Select, Slider, Toggle } from '../ui/Controls';
import { Row } from './Common';

type ArtChoice = 'none' | Articulation;

function Stepper({ label, onDown, onUp, title }: { label: string; onDown: () => void; onUp: () => void; title: string }) {
  return (
    <div className="stepper" title={title}>
      <button type="button" onClick={onDown} aria-label={`${title}: less`}>
        −
      </button>
      <span>{label}</span>
      <button type="button" onClick={onUp} aria-label={`${title}: more`}>
        +
      </button>
    </div>
  );
}

/** Properties of the selected notes (inspector section and the note-properties dialog). */
export function NoteEditor() {
  const project = useProject();
  const noteSel = useApp((s) => s.noteSel);
  const snap = useApp((s) => s.snap);
  const notes = useMemo(() => {
    const ids = new Set(noteSel);
    return periodNotes(project).filter((n) => ids.has(n.id));
  }, [project, noteSel]);
  if (!notes.length) return null;
  const ids = notes.map((n) => n.id);
  const first = notes[0];
  const single = notes.length === 1 ? first : null;
  const scale = scaleAtTick(project, first.start);
  const fifths = keyFifths(scale);
  const bt = (project.meter.num * TPQ * 4) / project.meter.den;
  const beat = (TPQ * 4) / project.meter.den;
  const pos = (t: number) => {
    const bar = Math.floor(t / bt);
    const b = Math.floor((t - bar * bt) / beat);
    const six = Math.floor((t - bar * bt - b * beat) / T16);
    const rest = Math.round(t - bar * bt - b * beat - six * T16);
    return `${bar + 1}.${b + 1}.${six + 1}${rest ? ` +${rest}` : ''}`;
  };
  const lo = Math.min(...notes.map((n) => n.pitch));
  const hi = Math.max(...notes.map((n) => n.pitch));
  const vel = Math.round(notes.reduce((s, n) => s + n.vel, 0) / notes.length);
  const durs = new Set(notes.map((n) => n.dur));
  const dur = durs.size === 1 ? first.dur : null;
  const arts = new Set(notes.map((n) => n.art ?? 'none'));
  const art = (arts.size === 1 ? [...arts][0] : 'none') as ArtChoice;
  const muted = notes.every((n) => n.mute);
  const lengthOpts = dur !== null && !LENGTHS.some((l) => l.value === dur) ? [...LENGTHS, { value: dur, label: lengthLabel(dur) }] : LENGTHS;

  return (
    <div className="note-editor">
      <div className="insp-caps">{single ? 'Note' : `${notes.length} notes`}</div>
      <Row label="Pitch" compact>
        <Stepper
          label={single ? prettyPitch(single.pitch, fifths) : lo === hi ? prettyPitch(lo, fifths) : `${prettyPitch(lo, fifths)} – ${prettyPitch(hi, fifths)}`}
          title="Semitone"
          onDown={() => transposeNotes(ids, -1, 'chromatic')}
          onUp={() => transposeNotes(ids, 1, 'chromatic')}
        />
      </Row>
      {single && (
        <div className="note-degree">
          {romanDegree(single.pitch, scale)} in {keyLabel(scale)}
          <span className="spacer" />
          <button type="button" className="link-btn" onClick={() => transposeNotes(ids, -1, 'diatonic')}>
            − step
          </button>
          <button type="button" className="link-btn" onClick={() => transposeNotes(ids, 1, 'diatonic')}>
            + step
          </button>
        </div>
      )}
      <Row label="Start" compact>
        <Stepper label={single ? pos(single.start) : `${pos(Math.min(...notes.map((n) => n.start)))} …`} title="Nudge by the snap value" onDown={() => moveNotes(ids, -Math.max(1, snap), 0)} onUp={() => moveNotes(ids, Math.max(1, snap), 0)} />
      </Row>
      <Row label="Length" compact>
        <Select<number | null>
          size="sm"
          value={dur}
          options={dur === null ? [{ value: null, label: 'Mixed' }, ...lengthOpts] : lengthOpts}
          onChange={(v) => v !== null && patchNotes(ids, { dur: v })}
          ariaLabel="Length"
        />
      </Row>
      <Row label="Velocity" compact>
        <div className="vel-row">
          <Slider value={vel} min={1} max={127} step={1} onChange={(v) => patchNotes(ids, { vel: v })} ariaLabel="Velocity" />
          <span>{vel}</span>
        </div>
      </Row>
      <div className="art-row">
        <Segmented<ArtChoice>
          value={art}
          onChange={(v) => patchNotes(ids, { art: v === 'none' ? undefined : v })}
          options={[
            { value: 'none', label: 'Plain' },
            { value: 'accent', label: 'Accent' },
            { value: 'staccato', label: 'Stacc.' },
            { value: 'tenuto', label: 'Ten.' },
          ]}
        />
      </div>
      <label className="toggle-row">
        <span>Muted</span>
        <Toggle on={muted} onChange={(v) => patchNotes(ids, { mute: v })} ariaLabel="Muted" />
      </label>
      <div className="note-actions">
        <button type="button" className="btn" onClick={duplicateNotes}>
          Duplicate
        </button>
        <button type="button" className="btn" onClick={() => setUi({ modal: { kind: 'note-tool', tool: 'transpose' } })}>
          Transpose…
        </button>
        <button type="button" className="btn danger" onClick={() => deleteNotes(ids)}>
          Delete
        </button>
      </div>
    </div>
  );
}
