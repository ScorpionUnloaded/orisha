/** Shared time axis and syntax overlays for every time-aligned editor. */
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { barTicks, cadencePoints, placeDrawings } from '../model/syntax';
import type { Project } from '../model/types';
import { select, seek, useApp } from '../store/store';

export interface Axis {
  x0: number;
  x1: number;
  startTick: number;
  endTick: number;
  startBar: number;
  bars: number;
  barLen: number;
  xOf: (tick: number) => number;
  tickOf: (x: number) => number;
}

export const GUTTER = 100;
export const RIGHT_PAD = 18;

export function useAxis(project: Project, width: number, win: { start: number; bars: number }, gutter = GUTTER, rightPad = RIGHT_PAD): Axis {
  return useMemo(() => {
    const barLen = barTicks(project.meter);
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
    const cadStart = cad ? Math.max(pl.startTick, cad.arrival - axis.barLen / 2) : pl.endTick;
    const xa = clampX(axis.xOf(pl.startTick)) + 4;
    const xb = clampX(axis.xOf(cad ? cadStart : pl.endTick)) - (cad ? 8 : 4);
    if (showTint && sel) {
      out.push(<rect key={`tint${pl.drawing.id}`} x={clampX(axis.xOf(pl.startTick))} y={y} width={clampX(axis.xOf(pl.endTick)) - clampX(axis.xOf(pl.startTick))} height={bottom - y} fill="var(--blue-tint)" />);
      if (showMotifSplit) {
        const mid = axis.xOf((pl.startTick + pl.endTick) / 2);
        if (mid > axis.x0 && mid < axis.x1) out.push(<line key={`split${pl.drawing.id}`} x1={mid} x2={mid} y1={y} y2={bottom} stroke="rgba(74,136,223,0.28)" strokeWidth={1} />);
      }
    }
    if (xb - xa > 20) {
      out.push(
        <g
          key={`br${pl.drawing.id}`}
          style={{ cursor: 'pointer' }}
          onClick={() => select({ kind: 'drawing', id: pl.drawing.id })}
        >
          <path d={`M${xa},${y + tick} V${y} H${xb} V${y + tick}`} className={`bracket ${sel ? 'sel' : ''}`} />
          {sel && showMotifSplit && <path d={`M${(xa + xb) / 2},${y} v${-4}`} className="bracket sel" />}
          <text x={(xa + xb) / 2} y={y - 10} textAnchor="middle" className={`bracket-label ${sel ? 'sel' : ''}`}>
            {prefix ? `${prefix} ${pl.drawing.label}` : pl.drawing.label}
          </text>
          <rect x={xa} y={y - 28} width={xb - xa} height={32} fill="transparent" />
        </g>,
      );
    }
    if (cad) {
      const ca = clampX(axis.xOf(cadStart));
      const cb = clampX(axis.xOf(Math.min(pl.endTick + axis.barLen * 0.1, cad.arrival + axis.barLen / 2)));
      if (cb - ca > 16) {
        out.push(
          <g key={`cad${pl.drawing.id}`}>
            <path d={`M${ca},${y + tick} V${y} H${cb} V${y + tick}`} className="bracket cad" />
            <text x={(ca + cb) / 2} y={y - 10} textAnchor="middle" className="bracket-label cad">
              {cadenceLabel === 'plain' ? 'Cadence' : CAD_SHORT[cad.type]}
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
