import { useState } from 'react';
import type { ReactElement } from 'react';
import { useSize } from './useSize';
import { CADENCES, CADENCE_ORDER, phraseTokens, totalBars } from '../model/syntax';
import { keyLabel, keyOptions, sameScale, shortKeyLabel } from '../model/theory';
import type { CadenceType, KeyRegion, Project, ScaleRef } from '../model/types';
import { select, setCadence, setRegionScale, setView, useApp, useProject } from '../store/store';
import { Popover } from './ui/Controls';
import { DotsGrid, ListIcon } from './ui/Icons';

export function regionColor(project: Project, scale: ScaleRef): string {
  if (sameScale(scale, project.key)) return '#cfe0f4';
  if (scale.mode === 'major') return '#efdcc4';
  return '#dcdcdb';
}

export function ModulationStrip() {
  const project = useProject();
  const [setRef, { width }] = useSize<HTMLDivElement>();
  const [edit, setEdit] = useState<{ region: KeyRegion; anchor: HTMLElement } | null>(null);
  const total = totalBars(project);
  const regions = [...project.regions].sort((a, b) => a.start - b.start);
  const h = 32;
  const x = (bar: number) => (Math.min(bar, total) / total) * width;
  const slant = 18;

  const shapes: ReactElement[] = [];
  const labels: ReactElement[] = [];
  const dividers: ReactElement[] = [];
  regions.forEach((r, i) => {
    const x1 = x(r.start);
    const x2 = x(r.end);
    const color = regionColor(project, r.scale);
    if (r.pivot) {
      const prev = regions[i - 1];
      const prevColor = prev ? regionColor(project, prev.scale) : color;
      const mid = (x1 + x2) / 2;
      shapes.push(<polygon key={`p${r.id}a`} points={`${x1},0 ${mid + slant},0 ${mid - slant},${h} ${x1},${h}`} fill={prevColor} opacity={0.78} />);
      shapes.push(<polygon key={`p${r.id}b`} points={`${mid + slant},0 ${x2},0 ${x2},${h} ${mid - slant},${h}`} fill={color} />);
      dividers.push(<line key={`d${r.id}`} x1={x1} y1={0} x2={x1} y2={h} stroke="#8c8c90" strokeDasharray="3 3" />);
      return;
    }
    shapes.push(<rect key={r.id} x={x1} y={0} width={Math.max(0, x2 - x1)} height={h} fill={color} />);
    if (i > 0 && !regions[i - 1].pivot) dividers.push(<line key={`d${r.id}`} x1={x1} y1={0} x2={x1} y2={h} stroke="#8c8c90" strokeDasharray="3 3" />);
    const labelX = regions[i - 1]?.pivot ? (x1 - (x(regions[i - 1].end) - x(regions[i - 1].start)) / 2 + x2) / 2 : (x1 + x2) / 2;
    labels.push(
      <text key={`l${r.id}`} x={labelX} y={h / 2 + 5} textAnchor="middle" fontSize={14} fill="#1c1c1e" style={{ pointerEvents: 'none' }}>
        {shortKeyLabel(r.scale)}
      </text>,
    );
  });

  return (
    <div className="strip mod">
      <div className="strip-label">
        <DotsGrid size={22} />
        <span className="caps">Modulation</span>
      </div>
      <div className="strip-body" ref={setRef}>
        {width > 0 && (
          <svg width={width} height={h} style={{ display: 'block', borderRadius: 3 }} role="group" aria-label="Modulation map">
            {shapes}
            {dividers}
            {labels}
            {regions.map((r) => (
              <rect
                key={`hit${r.id}`}
                x={x(r.start)}
                y={0}
                width={Math.max(0, x(r.end) - x(r.start))}
                height={h}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={(e) => setEdit({ region: r, anchor: e.currentTarget as unknown as HTMLElement })}
              >
                <title>{`${keyLabel(r.scale)} · bars ${Math.floor(r.start) + 1}–${Math.ceil(r.end)}${r.pivot ? ' (pivot)' : ''}`}</title>
              </rect>
            ))}
          </svg>
        )}
        <Popover anchor={edit?.anchor ?? null} open={!!edit} onClose={() => setEdit(null)} minWidth={170}>
          <div className="pop-title">Region key · bars {edit ? `${Math.floor(edit.region.start) + 1}–${Math.ceil(edit.region.end)}` : ''}</div>
          {keyOptions().map((k) => (
            <button
              key={`${k.tonic}-${k.mode}`}
              type="button"
              className="pop-item"
              onClick={() => {
                if (edit) setRegionScale(edit.region.id, k);
                setEdit(null);
              }}
            >
              <span className="check">{edit && sameScale(edit.region.scale, k) ? '✓' : ''}</span>
              {keyLabel(k)}
            </button>
          ))}
        </Popover>
      </div>
    </div>
  );
}

export function PhraseStrip() {
  const project = useProject();
  const selection = useApp((s) => s.selection);
  const view = useApp((s) => s.view);
  const [edit, setEdit] = useState<{ drawingId: string; anchor: HTMLElement } | null>(null);
  const tokens = phraseTokens(project);
  const selId = selection.kind === 'drawing' ? selection.id : '';
  return (
    <div className="strip phrase">
      <div className="strip-label">
        <ListIcon size={22} />
        <span className="caps">Phrase</span>
      </div>
      <div className="strip-body">
        <div className="phrase-bar" role="list" aria-label="Phrase structure">
          {tokens.map((t, i) =>
            t.kind === 'unit' ? (
              <button
                key={`u${t.drawingId}`}
                type="button"
                role="listitem"
                className={`phrase-unit ${t.drawingId === selId ? 'sel' : ''}`}
                onClick={() => {
                  select({ kind: 'drawing', id: t.drawingId });
                  if (view === 'home' || view === 'motif') setView('composer');
                }}
                title={`Drawing ${t.label}`}
              >
                [ {t.label} ]
              </button>
            ) : (
              <button
                key={`p${t.drawingId}${i}`}
                type="button"
                role="listitem"
                className="phrase-punct"
                title={`${CADENCES[t.type].label} cadence — click to change`}
                onClick={(e) => setEdit({ drawingId: t.drawingId, anchor: e.currentTarget })}
              >
                {t.char}
              </button>
            ),
          )}
        </div>
        <Popover anchor={edit?.anchor ?? null} open={!!edit} onClose={() => setEdit(null)} minWidth={170}>
          <div className="pop-title">Rest point</div>
          {CADENCE_ORDER.map((c: CadenceType) => (
            <button
              key={c}
              type="button"
              className="pop-item"
              onClick={() => {
                if (edit) setCadence(edit.drawingId, c);
                setEdit(null);
              }}
            >
              <span className="check">{edit && project.drawings.find((d) => d.id === edit.drawingId)?.cadence === c ? '✓' : ''}</span>
              {CADENCES[c].long}
              <span className="kbd">{CADENCES[c].punct || '—'}</span>
            </button>
          ))}
        </Popover>
      </div>
    </div>
  );
}
