import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { classifyContour, classifyRhythm, CONTOUR_LABEL, pitchRange, RHYTHM_LABEL } from '../model/analysis';
import type { RhythmCharacter } from '../model/analysis';
import { CATEGORY_LABEL, COLLECTIONS, MOODS } from '../model/demo';
import { rerhythm, rhythmTemplate } from '../model/rhythmTemplates';
import { barTicks, uid } from '../model/syntax';
import { keyFifths, prettyPitch, snapToScale } from '../model/theory';
import { applyContour, remapScale, sorted } from '../model/transforms';
import type { ContourShape } from '../model/transforms';
import { T16, T8, TPQ } from '../model/types';
import type { Motif, MotifCategory, Note, ScaleRef } from '../model/types';
import { variation, VARIATIONS } from '../model/variations';
import type { VariationId } from '../model/variations';
import { MiniStaff, Staff } from '../notation/Staff';
import { InspectorHead, Row } from '../components/inspector/Common';
import { scaleOptions } from '../components/inspector/ComposerInspector';
import { VIEW_ITEMS } from '../components/Panel';
import { PianoRoll, rollRange } from '../components/PianoRoll';
import type { RollNote, RollTool } from '../components/PianoRoll';
import { matchesFilter } from '../components/Sidebars';
import { useAxis } from '../components/Timeline';
import { EditableText, MenuButton, Segmented, Select, Toggle } from '../components/ui/Controls';
import { Close, Eraser, Marquee, Pencil, PlayIcon, Plus, Pointer, Star, TransformIcon } from '../components/ui/Icons';
import { useSize } from '../components/useSize';
import {
  addMotifToProject,
  audition,
  commitMotifVariation,
  placeMotifInDrawing,
  selectMotif,
  setMotifNotes,
  setUi,
  setView,
  toast,
  updateMotif,
  useApp,
  useProject,
} from '../store/store';

function useMotif(): Motif {
  const library = useApp((s) => s.library);
  const motifId = useApp((s) => s.motifId);
  return library.find((m) => m.id === motifId) ?? library[0];
}

const NOTE_LENGTHS: Array<{ value: number; label: string; glyph: string }> = [
  { value: TPQ * 2, label: 'Half', glyph: '' },
  { value: TPQ, label: 'Quarter', glyph: '' },
  { value: T8, label: 'Eighth', glyph: '' },
  { value: T16, label: 'Sixteenth', glyph: '' },
];

function NoteGlyph({ glyph }: { glyph: string }) {
  return (
    <span style={{ fontFamily: 'Bravura', fontSize: 26, lineHeight: '10px', display: 'inline-block', transform: 'translateY(7px)' }} aria-hidden>
      {glyph}
    </span>
  );
}

function EditorArea({ motif, width, height, previewNotes }: { motif: Motif; width: number; height: number; previewNotes: Note[] | null }) {
  const project = useProject();
  const show = useApp((s) => s.motifShow);
  const tool = useApp((s) => s.motifTool);
  const snap = useApp((s) => s.snap);
  const noteLength = useApp((s) => s.noteLength);
  const scaleQ = useApp((s) => s.scaleQuantize);
  const [sel, setSel] = useState<string[]>([]);
  const bars = Math.max(4, motif.bars);
  const win = useMemo(() => ({ start: 0, bars }), [bars]);
  const axis = useAxis(project, width, win, 78, 14);
  const bt = barTicks(project.meter);
  const fifths = keyFifths(motif.scale);

  useEffect(() => setSel([]), [motif.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel.length) {
        e.preventDefault();
        setMotifNotes(motif.id, motif.notes.filter((n) => !sel.includes(n.id)));
        setSel([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, motif]);

  const q = (p: number) => (scaleQ ? snapToScale(p, motif.scale) : p);
  const top = 30;
  const gridH = height - top - 6;
  const fit = rollRange([...motif.notes, ...(previewNotes ?? [])].map((n) => n.pitch), 30);
  const range = { lo: Math.min(fit.lo, 48), hi: Math.max(fit.hi, Math.min(fit.lo, 48) + 32) };
  const notes: RollNote[] = [
    ...motif.notes.map((n) => ({ id: n.id, pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel, ghost: !!previewNotes })),
    ...(previewNotes ?? []).map((n) => ({ id: `pv${n.id}`, pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel, preview: true })),
  ];

  const ruler = Array.from({ length: bars }, (_, b) => (
    <g key={b}>
      <text x={axis.xOf(b * bt)} y={16} className="axis-label" textAnchor="middle">
        {b + 1}
      </text>
      <line x1={axis.xOf(b * bt)} x2={axis.xOf(b * bt)} y1={22} y2={top} stroke="#bdbbb6" />
    </g>
  ));

  if (show === 'rhythm') {
    return (
      <svg className="svg-fill">
        {ruler}
        <Staff
          notes={previewNotes ?? motif.notes}
          opts={{ clef: 'percussion', fifths: 0, meter: project.meter, from: 0, to: bars * bt, percussion: () => ({ positions: [4] }) }}
          geo={{ sp: 10, top: height / 2 - 20, left: 8, right: axis.x1, preludeX: 6, showKey: false, finalBar: true }}
          xOf={axis.xOf}
          onNoteDown={(id) => {
            const n = motif.notes.find((x) => x.id === id);
            if (n) audition([{ ...n, start: 0 }]);
          }}
        />
        <text x={axis.x1} y={height - 10} textAnchor="end" className="axis-label">
          Rhythm view — pitches hidden
        </text>
      </svg>
    );
  }

  return (
    <svg className="svg-fill">
      {ruler}
      <PianoRoll
        notes={notes}
        axis={axis}
        top={top}
        height={gridH}
        keysX={12}
        keysW={28}
        range={range}
        scale={motif.scale}
        scaleHighlight={show === 'pitches' || show === 'both' || scaleQ}
        selected={sel}
        tool={tool as RollTool}
        snap={snap}
        noteLength={noteLength}
        fifths={fifths}
        showNames={show === 'pitches' || show === 'both'}
        readOnly={!!previewNotes}
        onSelect={(ids, additive) => setSel(additive ? Array.from(new Set([...sel, ...ids])) : ids)}
        onAdd={(t, p, d) => {
          const n: Note = { id: uid('n'), pitch: q(p), start: t, dur: d, vel: 86 };
          setMotifNotes(motif.id, [...motif.notes, n]);
          audition([{ ...n, start: 0 }]);
          setSel([n.id]);
        }}
        onDelete={(ids) => {
          setMotifNotes(motif.id, motif.notes.filter((n) => !ids.includes(n.id)));
          setSel([]);
        }}
        onMove={(ids, dT, dP, copy) => {
          const set = new Set(ids);
          const moved = motif.notes.filter((n) => set.has(n.id)).map((n) => ({ ...n, id: copy ? uid('n') : n.id, start: Math.max(0, n.start + dT), pitch: q(n.pitch + dP) }));
          setMotifNotes(motif.id, copy ? [...motif.notes, ...moved] : [...motif.notes.filter((n) => !set.has(n.id)), ...moved]);
        }}
        onResize={(ids, dD) => setMotifNotes(motif.id, motif.notes.map((n) => (ids.includes(n.id) ? { ...n, dur: Math.max(T16, n.dur + dD) } : n)))}
      >
        {motif.bars < bars ? <rect x={axis.xOf(motif.bars * bt)} y={top} width={axis.x1 - axis.xOf(motif.bars * bt)} height={gridH} fill="rgba(0,0,0,0.035)" pointerEvents="none" /> : null}
      </PianoRoll>
      {show === 'both' &&
        (() => {
          const s = sorted(previewNotes ?? motif.notes);
          const rows = range.hi - range.lo + 1;
          const rowH = gridH / rows;
          const pts = s.map((n) => `${axis.xOf(n.start + n.dur / 2)},${top + (range.hi - n.pitch) * rowH + rowH / 2}`).join(' ');
          return <polyline points={pts} fill="none" stroke="var(--orange)" strokeWidth={1.6} strokeLinejoin="round" opacity={0.8} pointerEvents="none" />;
        })()}
    </svg>
  );
}

export function MotifEditorView() {
  const motif = useMotif();
  const project = useProject();
  const show = useApp((s) => s.motifShow);
  const tool = useApp((s) => s.motifTool);
  const snap = useApp((s) => s.snap);
  const noteLength = useApp((s) => s.noteLength);
  const scaleQ = useApp((s) => s.scaleQuantize);
  const activeVar = useApp((s) => s.motifVariation);
  const filter = useApp((s) => s.libraryFilter);
  const library = useApp((s) => s.library);
  const [ref, size] = useSize<HTMLDivElement>();
  const bt = barTicks(project.meter);
  const len = motif.bars * bt;
  const fifths = keyFifths(motif.scale);
  const variations = useMemo(() => VARIATIONS.map((v) => ({ ...v, result: variation(v.id, motif.notes, len, motif.scale) })), [motif, len]);
  const preview = activeVar !== 'original' ? variations.find((v) => v.id === activeVar)!.result.notes : null;
  const listed = library.filter((m) => matchesFilter(m, filter));
  const idx = listed.findIndex((m) => m.id === motif.id);

  const tools: Array<{ id: RollTool; icon: ReactNode; label: string }> = [
    { id: 'draw', icon: <Pencil />, label: 'Draw' },
    { id: 'erase', icon: <Eraser />, label: 'Erase' },
    { id: 'select', icon: <Marquee />, label: 'Select' },
    { id: 'pointer', icon: <Pointer />, label: 'Move' },
  ];

  return (
    <div className="center motif-editor">
      <div className="panel-head" style={{ height: 54, flex: 'none' }}>
        <span className="caps">Motif Drawing Editor</span>
        <span className="spacer" />
        <Segmented
          value={show}
          onChange={(v) => setUi({ motifShow: v })}
          options={[
            { value: 'contour', label: 'Contour' },
            { value: 'pitches', label: 'Pitches' },
            { value: 'rhythm', label: 'Rhythm' },
            { value: 'both', label: 'Both' },
          ]}
        />
        <MenuButton
          label="Motif editor options"
          items={[
            ...VIEW_ITEMS('motif'),
            'sep',
            { label: 'Previous motif', disabled: idx <= 0, onSelect: () => selectMotif(listed[idx - 1].id) },
            { label: 'Next motif', disabled: idx < 0 || idx >= listed.length - 1, onSelect: () => selectMotif(listed[idx + 1].id) },
            'sep',
            { label: 'Play motif', onSelect: () => audition(motif.notes) },
            { label: 'Clear all notes', danger: true, onSelect: () => setMotifNotes(motif.id, []) },
          ]}
        />
      </div>
      <div ref={ref} style={{ flex: '1 1 0', minHeight: 170, position: 'relative', margin: '0 12px 0 0' }}>
        {size.width > 0 && <EditorArea motif={motif} width={size.width} height={size.height} previewNotes={preview} />}
        {!motif.notes.length && <div className="empty-hint">Choose the pencil and click in the grid to draw a motif</div>}
      </div>
      <div className="motif-toolbar">
        <div className="tool-group" role="toolbar" aria-label="Drawing tools">
          {tools.map((t) => (
            <button key={t.id} type="button" className={tool === t.id ? 'on' : ''} onClick={() => setUi({ motifTool: t.id })} title={t.label} aria-label={t.label} aria-pressed={tool === t.id}>
              {t.icon}
            </button>
          ))}
        </div>
        <span className="tb-label">Note length</span>
        <Select
          value={noteLength}
          options={NOTE_LENGTHS.map((n) => ({ value: n.value, label: n.label }))}
          onChange={(v) => setUi({ noteLength: v })}
          display={<NoteGlyph glyph={NOTE_LENGTHS.find((n) => n.value === noteLength)?.glyph ?? ''} />}
          style={{ width: 96, height: 38 }}
          ariaLabel="Note length"
        />
        <span className="tb-label">Snap</span>
        <Select
          value={snap}
          options={[
            { value: TPQ, label: '1/4' },
            { value: T8, label: '1/8' },
            { value: T16, label: '1/16' },
          ]}
          onChange={(v) => setUi({ snap: v })}
          style={{ width: 90, height: 38 }}
          ariaLabel="Snap"
        />
        <span className="spacer" />
        <Toggle large on={scaleQ} onChange={(v) => setUi({ scaleQuantize: v })} ariaLabel="Scale quantize" />
        <span className="tb-label" style={{ marginLeft: 10 }}>
          Scale quantize
        </span>
      </div>
      <div className="motif-section">
        <div className="motif-section-head">
          <span className="caps">Transformations</span>
          <span className="spacer" />
          {activeVar !== 'original' && (
            <>
              <button type="button" className="btn" style={{ height: 28 }} onClick={() => commitMotifVariation(true)}>
                Save as new motif
              </button>
              <button type="button" className="btn primary" style={{ height: 28 }} onClick={() => commitMotifVariation(false)}>
                Commit
              </button>
            </>
          )}
        </div>
        <div className="tiles" role="tablist">
          {VARIATIONS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={activeVar === v.id} className={`tile ${activeVar === v.id ? 'on' : ''}`} onClick={() => setUi({ motifVariation: v.id })}>
              <TransformIcon kind={v.id === 'sequence' ? 'combine' : v.id} />
              <span>{v.tile}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="motif-section" style={{ flex: '0 0 auto', paddingBottom: 12 }}>
        <div className="motif-section-head">
          <span className="caps">Variations Preview</span>
        </div>
        <div className="var-grid">
          {variations.map((v) => (
            <div
              key={v.id}
              className={`var-card ${activeVar === v.id ? 'on' : ''}`}
              onClick={() => setUi({ motifVariation: v.id as VariationId })}
              onDoubleClick={() => v.id !== 'original' && commitMotifVariation(false)}
              role="button"
              tabIndex={0}
              aria-label={v.card}
            >
              <div className="var-title">{v.card}</div>
              <button
                type="button"
                className="var-play"
                aria-label={`Play ${v.card}`}
                onClick={(e) => {
                  e.stopPropagation();
                  audition(v.result.notes);
                }}
              >
                <PlayIcon size={12} />
              </button>
              <MiniStaff notes={v.result.notes} fifths={fifths} meter={project.meter} from={0} to={Math.max(bt, v.result.length)} width={236} height={50} sp={4.4} showTime={false} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tags({ motif }: { motif: Motif }) {
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {motif.tags.map((t) => (
        <span key={t} className="chip">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => updateMotif(motif.id, { tags: motif.tags.filter((x) => x !== t) })}>
            <Close size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={input}
          className="field sm"
          style={{ width: 90 }}
          placeholder="tag"
          onKeyDown={(e) => {
            e.stopPropagation();
            const v = (e.target as HTMLInputElement).value.trim();
            if (e.key === 'Enter' && v) {
              if (!motif.tags.includes(v)) updateMotif(motif.id, { tags: [...motif.tags, v] });
              setAdding(false);
            }
            if (e.key === 'Escape') setAdding(false);
          }}
          onBlur={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="chip" style={{ width: 26, justifyContent: 'center', padding: 0, background: 'transparent', border: '1px solid var(--control-border)', cursor: 'pointer' }} aria-label="Add tag" onClick={() => setAdding(true)}>
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}

export function MotifInspector() {
  const motif = useMotif();
  const project = useProject();
  const selection = useApp((s) => s.selection);
  const bt = barTicks(project.meter);
  const range = pitchRange(motif.notes);
  const contour = classifyContour(motif.notes);
  const rhythm = classifyRhythm(motif.notes, project.meter);
  const drawingId = selection.kind === 'drawing' ? selection.id : undefined;
  const drawing = project.drawings.find((d) => d.id === drawingId);
  return (
    <>
      <InspectorHead
        menu={[
          { label: drawing ? `Place in drawing ${drawing.label}` : 'Place in selected drawing', disabled: !drawing, onSelect: () => drawing && placeMotifInDrawing(motif.id, drawing.id) },
          { label: 'Add to project motifs', disabled: project.motifs.includes(motif.id), onSelect: () => addMotifToProject(motif.id) },
          { label: 'Audition', onSelect: () => audition(motif.notes) },
          'sep',
          { label: 'Back to Composer', onSelect: () => setView('composer') },
        ]}
      />
      <div className="insp-caps" style={{ marginTop: 18 }}>
        Motif
      </div>
      <Row label="Name" className="wide">
        <EditableText value={motif.name} onCommit={(v) => updateMotif(motif.id, { name: v || motif.name })} />
      </Row>
      <Row label="Collection" className="wide">
        <Select
          value={motif.collections[0] ?? ''}
          options={[{ value: '', label: 'None' }, ...COLLECTIONS.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(v) => updateMotif(motif.id, { collections: v ? [v, ...motif.collections.filter((c) => c !== v)] : motif.collections.slice(1) })}
          ariaLabel="Collection"
        />
      </Row>
      <Row label="Category" className="wide">
        <Select<MotifCategory>
          value={motif.category}
          options={(Object.keys(CATEGORY_LABEL) as MotifCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          onChange={(v) => updateMotif(motif.id, { category: v })}
          ariaLabel="Category"
        />
      </Row>
      <div className="row wide" style={{ alignItems: 'start', paddingTop: 6 }}>
        <span style={{ paddingTop: 4 }}>Tags</span>
        <Tags motif={motif} />
      </div>
      <div className="insp-section" style={{ marginTop: 10 }}>
        <div className="insp-caps">Description</div>
        <EditableText multiline value={motif.description} placeholder="Describe the motif…" onCommit={(v) => updateMotif(motif.id, { description: v })} />
      </div>
      <div className="insp-section">
        <div className="insp-caps">Properties</div>
        <Row label="Length" className="wide">
          <Select value={motif.bars} options={[1, 2, 3, 4, 6, 8].map((b) => ({ value: b, label: `${b} bar${b > 1 ? 's' : ''}` }))} onChange={(v) => updateMotif(motif.id, { bars: v, notes: motif.notes.filter((n) => n.start < v * bt).map((n) => ({ ...n, dur: Math.min(n.dur, v * bt - n.start) })) })} ariaLabel="Length" />
        </Row>
        <Row label="Pitch range" className="wide">
          <div className="field">{range ? `${prettyPitch(range[0], keyFifths(motif.scale))} – ${prettyPitch(range[1], keyFifths(motif.scale))}` : '—'}</div>
        </Row>
        <Row label="Contour" className="wide">
          <Select<ContourShape>
            value={contour}
            options={(Object.keys(CONTOUR_LABEL) as ContourShape[]).map((c) => ({ value: c, label: CONTOUR_LABEL[c] }))}
            onChange={(v) => updateMotif(motif.id, { notes: applyContour(motif.notes, v, motif.bars * bt, motif.scale) })}
            ariaLabel="Contour"
          />
        </Row>
        <Row label="Rhythm" className="wide">
          <Select<RhythmCharacter>
            value={rhythm}
            options={(Object.keys(RHYTHM_LABEL) as RhythmCharacter[]).map((c) => ({ value: c, label: RHYTHM_LABEL[c] }))}
            onChange={(v) => updateMotif(motif.id, { notes: rerhythm(motif.notes, rhythmTemplate(v, motif.bars * bt)) })}
            ariaLabel="Rhythm"
          />
        </Row>
        <Row label="Scale" className="wide">
          <Select<ScaleRef> value={motif.scale} options={scaleOptions(motif.scale)} onChange={(v) => updateMotif(motif.id, { notes: remapScale(motif.notes, motif.scale, v), scale: v })} ariaLabel="Scale" />
        </Row>
        <Row label="Mood" className="wide">
          <Select value={motif.mood} options={MOODS.map((m) => ({ value: m, label: m }))} onChange={(v) => updateMotif(motif.id, { mood: v })} ariaLabel="Mood" />
        </Row>
        <Row label="Favourites" className="wide">
          <button
            type="button"
            className="icon-btn"
            style={{ width: 32, height: 32, color: motif.favourite ? 'var(--orange)' : 'var(--text-2)' }}
            aria-pressed={motif.favourite}
            aria-label={motif.favourite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => {
              updateMotif(motif.id, { favourite: !motif.favourite });
              toast(motif.favourite ? 'Removed from Favourites' : 'Added to Favourites');
            }}
          >
            <Star filled={motif.favourite} />
          </button>
        </Row>
      </div>
    </>
  );
}

