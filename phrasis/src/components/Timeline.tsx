/** Shared time axis and syntax overlays for every time-aligned editor. */
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { barTicks, beatTicks, CADENCES, cadencePoints, placeDrawings } from '../model/syntax';
import type { Project } from '../model/types';
import { select, seek, selectTimeRange, setTimeSel, useApp } from '../store/store';

export interface Axis {
  x0: number;
  x1: number;
  startTick: number;
  endTick: number;
  startBar: number;
  bars: number;
  barLen: number;
  beatLen: number;
  xOf: (tick: number) => number;
  tickOf: (x: number) => number;
}

export const GUTTER = 100;
export const RIGHT_PAD = 18;

export function useAxis(project: Project, width: number, win: { start: number; bars: number }, gutter = GUTTER, rightPad = RIGHT_PAD): Axis {
  return useMemo(() => {
    const barLen = barTicks(project.meter);
    const beatLen = beatTicks(project.meter);
    const startTick = win.start * barLen;
    const endTick = (win.start + win.bars) * barLen;
    const x0 = gutter;
    const x1 = Math.max(gutter + 50, width - rightPad);
    const k = (x1 - x0) / (endTick - startTick);
    return {
      x0,
      x1,
      startTick,
      endTick,
      startBar: win.start,
      bars: win.bars,
      barLen,
      beatLen,
      xOf: (t: number) => x0 + (t - startTick) * k,
      tickOf: (x: number) => startTick + (x - x0) / k,
    };
  }, [project.meter, width, win.start, win.bars, gutter, rightPad]);
}

export const CAD_SHORT: Record<string, string> = {
  quarter: '¼ Cad.',
  half: '½ Cad.',
  strong: '¾ Cad.',
  full: 'Full Cad.',
};

interface BracketProps {
  project: Project;
  axis: Axis;
  /** y of the bracket line. */
  y: number;
  /** Bottom of the tinted region under the selected drawing. */
  bottom: number;
  prefix: 'Drawing' | 'Pattern' | '';
  cadenceLabel?: 'short' | 'plain';
  selectedId?: string;
  showTint?: boolean;
  showMotifSplit?: boolean;
  cadTop?: number;
}

/** Drawing / cadence brackets, the selection tint and cadence lines. */
export function SyntaxBrackets({ project, axis, y, bottom, prefix, cadenceLabel = 'short', selectedId, showTint = true, showMotifSplit = true, cadTop }: BracketProps) {
  const placed = placeDrawings(project);
  const cads = cadencePoints(project);
  const out: ReactElement[] = [];
  const clampX = (x: number) => Math.max(axis.x0, Math.min(axis.x1, x));
  const tick = 6;
  for (const pl of placed) {
    if (pl.endTick <= axis.startTick || pl.startTick >= axis.endTick) continue;
    const sel = pl.drawing.id === selectedId;
    const cad = cads.find((c) => c.drawingId === pl.drawing.id);
    const cadStart = cad ? Math.max(pl.startTick, cad.arrival - Math.min(axis.barLen / 2, (cad.arrival - pl.startTick) / 3)) : pl.endTick;
    const xa = clampX(axis.xOf(pl.startTick)) + 4;
    const xb = clampX(axis.xOf(cad ? cadStart : pl.endTick)) - (cad ? 8 : 4);
    if (showTint && sel) {
      out.push(<rect key={`tint${pl.drawing.id}`} x={clampX(axis.xOf(pl.startTick))} y={y} width={clampX(axis.xOf(pl.endTick)) - clampX(axis.xOf(pl.startTick))} height={bottom - y} fill="var(--blue-tint)" />);
      if (showMotifSplit) {
        const mid = axis.xOf((pl.startTick + pl.endTick) / 2);
        if (mid > axis.x0 && mid < axis.x1) out.push(<line key={`split${pl.drawing.id}`} x1={mid} x2={mid} y1={y} y2={bottom} stroke="rgba(74,136,223,0.28)" strokeWidth={1} />);
      }
    }
    const full = prefix ? `${prefix} ${pl.drawing.label}` : pl.drawing.label;
    const label = xb - xa >= full.length * 7.4 + 6 ? full : pl.drawing.label;
    if (xb - xa > 20) {
      out.push(
        <g
          key={`br${pl.drawing.id}`}
          style={{ cursor: 'pointer' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => select({ kind: 'drawing', id: pl.drawing.id })}
        >
          <path d={`M${xa},${y + tick} V${y} H${xb} V${y + tick}`} className={`bracket ${sel ? 'sel' : ''}`} />
          {sel && showMotifSplit && <path d={`M${(xa + xb) / 2},${y} v${-4}`} className="bracket sel" />}
          <text x={(xa + xb) / 2} y={y - 10} textAnchor="middle" className={`bracket-label ${sel ? 'sel' : ''}`}>
            {label}
          </text>
          <rect x={xa} y={y - 28} width={xb - xa} height={32} fill="transparent" />
        </g>,
      );
    }
    if (cad) {
      const ca = clampX(axis.xOf(cadStart));
      const cb = clampX(axis.xOf(Math.min(pl.endTick + axis.barLen * 0.1, cad.arrival + axis.barLen / 2)));
      if (cb - ca > 16) {
        const long = cadenceLabel === 'plain' ? 'Cadence' : CAD_SHORT[cad.type];
        const text = cb - ca >= long.length * 7 + 4 ? long : CADENCES[cad.type].frac;
        out.push(
          <g key={`cad${pl.drawing.id}`}>
            <path d={`M${ca},${y + tick} V${y} H${cb} V${y + tick}`} className="bracket cad" />
            <text x={(ca + cb) / 2} y={y - 10} textAnchor="middle" className="bracket-label cad">
              {text}
            </text>
          </g>,
        );
      }
      const cx = axis.xOf(cad.arrival);
      if (cx >= axis.x0 && cx <= axis.x1) out.push(<line key={`cl${pl.drawing.id}`} x1={cx} x2={cx} y1={cadTop ?? y} y2={bottom} className="cad-line" />);
    }
  }
  return <g>{out}</g>;
}

/** Bar numbers along the bottom of a panel. */
export function BarNumbers({ axis, y, every = 1 }: { axis: Axis; y: number; every?: number }) {
  const out: ReactElement[] = [];
  for (let b = 0; b < axis.bars; b++) {
    const bar = axis.startBar + b;
    if (bar % every !== 0) continue;
    const x = axis.xOf(bar * axis.barLen);
    out.push(
      <text key={bar} x={x} y={y} textAnchor="middle" className="axis-label" style={{ cursor: 'pointer' }} onClick={() => seek(bar * axis.barLen)}>
        {bar + 1}
      </text>,
    );
  }
  return <g>{out}</g>;
}

/** The transport playhead, shared by every aligned view. */
export function Playhead({ axis, top, bottom }: { axis: Axis; top: number; bottom: number }) {
  const playhead = useApp((s) => s.playhead);
  const playing = useApp((s) => s.playing);
  const recording = useApp((s) => s.recording);
  if ((!playing && !recording && playhead === 0) || playhead < axis.startTick || playhead > axis.endTick) return null;
  const x = axis.xOf(playhead);
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={top} y2={bottom} className="playhead" stroke={recording ? '#e5484d' : undefined} />
      <path d={`M${x - 4},${top - 5} h8 l-4,5 z`} fill={recording ? '#e5484d' : '#1e1e1e'} />
    </g>
  );
}

/** The ruler's time selection, shaded across an editor. */
export function TimeSelBand({ axis, top, bottom }: { axis: Axis; top: number; bottom: number }) {
  const sel = useApp((s) => s.timeSel);
  if (!sel || sel.to <= axis.startTick || sel.from >= axis.endTick) return null;
  const xa = Math.max(axis.x0, axis.xOf(sel.from));
  const xb = Math.min(axis.x1, axis.xOf(sel.to));
  return <rect x={xa} y={top} width={Math.max(0, xb - xa)} height={bottom - top} className="time-sel" pointerEvents="none" />;
}

/**
 * Bar/beat ruler. Click to move the playhead; drag to make a time selection
 * (which selects the notes inside it and becomes the loop range); double-click clears it.
 */
export function TimeRuler({ axis, y, height = 16, snap }: { axis: Axis; y: number; height?: number; snap: number }) {
  const sel = useApp((s) => s.timeSel);
  const [drag, setDrag] = useState<{ from: number; to: number; x0: number } | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const tickAt = (e: ReactPointerEvent) => {
    const x = e.clientX - rect.current!.left;
    const t = axis.tickOf(Math.max(axis.x0, Math.min(axis.x1, x)));
    const g = e.altKey ? 1 : snap;
    return Math.round(t / g) * g;
  };
  const marks: ReactElement[] = [];
  const beatPx = axis.xOf(axis.startTick + axis.beatLen) - axis.x0;
  for (let t = axis.startTick; t <= axis.endTick; t += axis.beatLen) {
    const x = axis.xOf(t);
    const isBar = Math.abs(t % axis.barLen) < 1;
    if (!isBar && beatPx < 6) continue;
    marks.push(<line key={t} x1={x} x2={x} y1={isBar ? y : y + height * 0.55} y2={y + height} className="ruler-tick" />);
    if (isBar) {
      const bar = Math.round(t / axis.barLen);
      if (t < axis.endTick)
        marks.push(
          <text key={`b${t}`} x={x + 4} y={y + height - 4} className="ruler-num">
            {bar + 1}
          </text>,
        );
    } else if (beatPx > 34) {
      const bar = Math.floor(t / axis.barLen);
      const beat = Math.round((t - bar * axis.barLen) / axis.beatLen) + 1;
      marks.push(
        <text key={`t${t}`} x={x + 3} y={y + height - 4} className="ruler-num beat">
          {`${bar + 1}.${beat}`}
        </text>,
      );
    }
  }
  const shown = drag ? { from: Math.min(drag.from, drag.to), to: Math.max(drag.from, drag.to) } : sel;
  return (
    <g
      className="ruler"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const svg = (e.currentTarget as SVGGElement).ownerSVGElement!;
        rect.current = svg.getBoundingClientRect();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const t = tickAt(e);
        setDrag({ from: t, to: t, x0: e.clientX });
      }}
      onPointerMove={(e) => {
        if (drag) setDrag({ ...drag, to: tickAt(e) });
      }}
      onPointerUp={(e) => {
        if (!drag) return;
        const to = tickAt(e);
        if (Math.abs(e.clientX - drag.x0) < 4) {
          seek(axis.tickOf(Math.max(axis.x0, e.clientX - rect.current!.left)));
        } else {
          setTimeSel({ from: drag.from, to });
          selectTimeRange(drag.from, to, e.shiftKey);
        }
        setDrag(null);
      }}
      onDoubleClick={() => setTimeSel(null)}
    >
      <rect x={axis.x0} y={y} width={axis.x1 - axis.x0} height={height} className="ruler-bg" />
      {shown && shown.to > axis.startTick && shown.from < axis.endTick && (
        <rect
          x={Math.max(axis.x0, axis.xOf(shown.from))}
          y={y}
          width={Math.max(0, Math.min(axis.x1, axis.xOf(shown.to)) - Math.max(axis.x0, axis.xOf(shown.from)))}
          height={height}
          className="ruler-sel"
        />
      )}
      {marks}
      <title>Click to move the playhead · drag to select time (loop range) · double-click to clear</title>
    </g>
  );
}
