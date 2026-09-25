import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { inScale, isBlackKey, prettyPitch } from '../model/theory';
import type { ScaleRef } from '../model/types';
import { audition } from '../store/store';
import type { Axis } from './Timeline';

export interface RollNote {
  id: string;
  pitch: number;
  /** Tick on the axis. */
  start: number;
  dur: number;
  vel: number;
  ghost?: boolean;
  preview?: boolean;
}

export type RollTool = 'draw' | 'erase' | 'select' | 'pointer';

interface Props {
  notes: RollNote[];
  axis: Axis;
  top: number;
  height: number;
  /** Left edge of the keyboard. */
  keysX: number;
  keysW?: number;
  range?: { lo: number; hi: number };
  scale?: ScaleRef;
  scaleHighlight?: boolean;
  selected: string[];
  tool?: RollTool;
  snap: number;
  noteLength: number;
  fifths: number;
  showNames?: boolean;
  compressed?: boolean;
  readOnly?: boolean;
  onSelect?: (ids: string[], additive: boolean) => void;
  onMove?: (ids: string[], dTick: number, dPitch: number, copy: boolean) => void;
  onResize?: (ids: string[], dDur: number) => void;
  onAdd?: (tick: number, pitch: number, dur: number) => void;
  onDelete?: (ids: string[]) => void;
  /** Extra tooltip text per note (e.g. scale degree in the local key). */
  describe?: (n: RollNote) => string;
  children?: ReactElement | ReactElement[] | null | false;
}

export function rollRange(pitches: number[], minSpan = 26): { lo: number; hi: number } {
  if (!pitches.length) return { lo: 48, hi: 48 + minSpan };
  let lo = Math.min(...pitches) - 3;
  let hi = Math.max(...pitches) + 4;
  if (hi - lo < minSpan) {
    const extra = minSpan - (hi - lo);
    lo -= Math.floor(extra / 2);
    hi += Math.ceil(extra / 2);
  }
  // Keep a C label at the bottom when possible.
  if (lo % 12 !== 0 && lo % 12 <= 3) lo -= lo % 12;
  return { lo, hi };
}

type Drag =
  | { kind: 'move' | 'resize'; ids: string[]; x0: number; y0: number; dTick: number; dPitch: number; copy: boolean; moved: boolean; hitId: string }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: 'erase' };

export function PianoRoll(props: Props) {
  const { axis, top, height, keysX, notes, snap, fifths } = props;
  const keysW = props.keysW ?? 44;
  const range = props.range ?? rollRange(notes.filter((n) => !n.ghost).map((n) => n.pitch));
  const rows = range.hi - range.lo + 1;
  const rowH = height / rows;
  const yOf = (pitch: number) => top + (range.hi - pitch) * rowH;
  const pitchOf = (y: number) => range.hi - Math.floor((y - top) / rowH);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGGElement>(null);
  const selected = new Set(props.selected);
  const tool = props.tool ?? 'pointer';

  const local = (e: ReactPointerEvent) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const snapTick = (t: number) => Math.round(t / snap) * snap;

  const onNoteDown = (e: ReactPointerEvent, n: RollNote) => {
    if (props.readOnly || n.ghost) return;
    e.stopPropagation();
    if (tool === 'erase') {
      props.onDelete?.([n.id]);
      return;
    }
    const p = local(e);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids = props.selected;
    if (!selected.has(n.id)) {
      ids = additive ? [...props.selected, n.id] : [n.id];
      props.onSelect?.(ids, false);
    } else if (additive) {
      props.onSelect?.(props.selected.filter((x) => x !== n.id), false);
      return;
    }
    const xEnd = axis.xOf(n.start + n.dur);
    const resize = xEnd - p.x < 7;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ kind: resize ? 'resize' : 'move', ids, x0: p.x, y0: p.y, dTick: 0, dPitch: 0, copy: e.altKey, moved: false, hitId: n.id });
  };

  const onBgDown = (e: ReactPointerEvent) => {
    if (props.readOnly) return;
    const p = local(e);
    if (p.x < axis.x0 || p.x > axis.x1) return;
    const tick = axis.tickOf(p.x);
    const pitch = pitchOf(p.y);
    if (tool === 'draw') {
      const start = Math.floor(tick / snap) * snap;
      props.onAdd?.(start, pitch, props.noteLength);
      return;
    }
    if (tool === 'erase') {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDrag({ kind: 'erase' });
      return;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.shiftKey || e.metaKey });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = local(e);
    if (drag.kind === 'marquee') {
      setDrag({ ...drag, x1: p.x, y1: p.y });
    } else if (drag.kind === 'erase') {
      const tick = axis.tickOf(p.x);
      const pitch = pitchOf(p.y);
      const hit = notes.find((n) => !n.ghost && n.pitch === pitch && tick >= n.start && tick < n.start + n.dur);
      if (hit) props.onDelete?.([hit.id]);
    } else {
      const dTickRaw = axis.tickOf(p.x) - axis.tickOf(drag.x0);
      const dTick = snapTick(dTickRaw);
      const dPitch = drag.kind === 'move' ? Math.round((drag.y0 - p.y) / rowH) : 0;
      const moved = drag.moved || Math.abs(p.x - drag.x0) > 3 || Math.abs(p.y - drag.y0) > 3;
      if (dTick !== drag.dTick || dPitch !== drag.dPitch || moved !== drag.moved) {
        if (drag.kind === 'move' && dPitch !== drag.dPitch) {
          const n = notes.find((x) => x.id === drag.hitId);
          if (n) audition([{ id: 'a', pitch: n.pitch + dPitch, start: 0, dur: 180, vel: 80 }]);
        }
        setDrag({ ...drag, dTick, dPitch, moved });
      }
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.kind === 'marquee') {
      const xa = Math.min(drag.x0, drag.x1);
      const xb = Math.max(drag.x0, drag.x1);
      const ya = Math.min(drag.y0, drag.y1);
      const yb = Math.max(drag.y0, drag.y1);
      if (xb - xa < 3 && yb - ya < 3) {
        if (!drag.additive) props.onSelect?.([], false);
      } else {
        const hits = notes.filter((n) => {
          if (n.ghost) return false;
          const nx = axis.xOf(n.start);
          const nx2 = axis.xOf(n.start + n.dur);
          const ny = yOf(n.pitch);
          return nx2 >= xa && nx <= xb && ny + rowH >= ya && ny <= yb;
        });
        props.onSelect?.(hits.map((n) => n.id), drag.additive);
      }
    } else if (drag.kind === 'move' || drag.kind === 'resize') {
      if (!drag.moved) {
        const n = notes.find((x) => x.id === drag.hitId);
        if (n) audition([{ id: n.id, pitch: n.pitch, start: 0, dur: Math.min(n.dur, 480), vel: n.vel }]);
      } else if (drag.kind === 'move' && (drag.dTick || drag.dPitch)) props.onMove?.(drag.ids, drag.dTick, drag.dPitch, drag.copy);
      else if (drag.kind === 'resize' && drag.dTick) props.onResize?.(drag.ids, drag.dTick);
    }
    setDrag(null);
  };

  // --- rendering
  const rowsEls: ReactElement[] = [];
  const whiteKeys: ReactElement[] = [];
  const blackKeys: ReactElement[] = [];
  for (let p = range.hi; p >= range.lo; p--) {
    const y = yOf(p);
    const black = isBlackKey(p);
    const outOfScale = props.scaleHighlight && props.scale ? !inScale(p, props.scale) : false;
    rowsEls.push(<rect key={`r${p}`} x={axis.x0} y={y} width={axis.x1 - axis.x0} height={rowH} fill={outOfScale ? '#e6e5e2' : black ? '#ebeae7' : '#f4f3f1'} />);
    if (p % 12 === 0 || p % 12 === 5) rowsEls.push(<line key={`rl${p}`} x1={axis.x0} x2={axis.x1} y1={y + rowH} y2={y + rowH} stroke="#e1dfdb" />);
    (black ? blackKeys : whiteKeys).push(
      <rect
        key={`k${p}`}
        x={keysX}
        y={y}
        width={black ? keysW * 0.62 : keysW}
        height={rowH}
        fill={black ? '#1b1b1b' : '#fbfbfa'}
        stroke={black ? 'none' : '#d6d4d0'}
        strokeWidth={0.6}
        style={{ cursor: 'pointer' }}
        onPointerDown={() => audition([{ id: 'k', pitch: p, start: 0, dur: 360, vel: 90 }])}
      />,
    );
  }
  const keys = [...whiteKeys, ...blackKeys];

  const grid: ReactElement[] = [];
  const beat = axis.barLen / 4;
  const sub = axis.xOf(axis.startTick + beat / 2) - axis.x0 > 14;
  for (let t = axis.startTick; t <= axis.endTick; t += sub ? beat / 2 : beat) {
    const x = axis.xOf(t);
    const isBar = Math.abs(t % axis.barLen) < 1;
    const isBeat = Math.abs(t % beat) < 1;
    grid.push(<line key={`g${t}`} x1={x} x2={x} y1={top} y2={top + height} className={isBar ? 'grid-bar' : 'grid-beat'} opacity={isBeat ? 1 : 0.55} />);
  }

  const labels: ReactElement[] = [];
  for (let p = range.lo; p <= range.hi; p++) {
    if (p % 12 !== 0) continue;
    labels.push(
      <text key={`lab${p}`} x={keysX + keysW + 8} y={yOf(p) + rowH / 2 + 4.5} fontSize={12.5} fill="var(--text-2)">
        {`C${p / 12 - 1}`}
      </text>,
    );
  }

  const moving = drag && (drag.kind === 'move' || drag.kind === 'resize') && drag.moved ? drag : null;
  const movingIds = new Set(moving?.ids ?? []);
  const noteEls = notes.map((n) => {
    let start = n.start;
    let dur = n.dur;
    let pitch = n.pitch;
    if (moving && movingIds.has(n.id)) {
      if (moving.kind === 'move') {
        start += moving.dTick;
        pitch += moving.dPitch;
      } else dur = Math.max(snap / 2, dur + moving.dTick);
    }
    const x = axis.xOf(start);
    const w = Math.max(3, axis.xOf(start + dur) - x - 1);
    if (x + w < axis.x0 || x > axis.x1) return null;
    const y = yOf(pitch);
    const sel = selected.has(n.id);
    const h = Math.max(4, rowH - (props.compressed ? 1 : 1.5));
    return (
      <g key={n.id + (moving?.copy && movingIds.has(n.id) ? '-c' : '')}>
        {moving?.copy && movingIds.has(n.id) && <rect x={axis.xOf(n.start)} y={yOf(n.pitch) + 0.75} width={w} height={h} rx={2} fill="var(--note)" opacity={0.35} />}
        <rect
          x={x}
          y={y + 0.75}
          width={w}
          height={h}
          rx={2}
          fill={n.ghost ? '#c3c2bf' : n.preview ? 'var(--orange)' : sel ? 'var(--note-sel)' : 'var(--note)'}
          stroke={n.ghost ? 'none' : sel ? '#1f4f9c' : 'var(--note-edge)'}
          strokeWidth={sel ? 1.2 : 0.6}
          opacity={n.ghost ? 0.7 : n.preview ? 0.85 : 0.94}
          style={{ cursor: props.readOnly || n.ghost ? 'default' : tool === 'erase' ? 'not-allowed' : 'grab' }}
          onPointerDown={(e) => onNoteDown(e, n)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <title>{`${prettyPitch(pitch, fifths)}${props.describe ? ` · ${props.describe({ ...n, pitch })}` : ''} · vel ${n.vel}`}</title>
        </rect>
        {props.showNames && w > 18 && h >= 8 && (
          <text x={x + 3} y={y + h / 2 + 4.2} fontSize={9.5} fill="#fff" pointerEvents="none">
            {prettyPitch(pitch, fifths, false)}
          </text>
        )}
      </g>
    );
  });

  return (
    <g ref={svgRef}>
      <g onPointerDown={onBgDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={(e) => {
        if (props.readOnly || tool === 'draw' || tool === 'erase') return;
        const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
        const r = svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (x < axis.x0 || x > axis.x1) return;
        props.onAdd?.(Math.floor(axis.tickOf(x) / snap) * snap, pitchOf(y), props.noteLength);
      }} style={{ cursor: tool === 'draw' ? 'crosshair' : 'default' }}>
        {rowsEls}
        {grid}
        <rect x={axis.x0} y={top} width={axis.x1 - axis.x0} height={height} fill="transparent" />
      </g>
      {keys}
      {labels}
      <rect x={keysX} y={top} width={keysW} height={height} fill="none" stroke="#cfcdc9" strokeWidth={0.8} pointerEvents="none" />
      {props.children}
      {noteEls}
      {drag?.kind === 'marquee' && (
        <rect
          x={Math.min(drag.x0, drag.x1)}
          y={Math.min(drag.y0, drag.y1)}
          width={Math.abs(drag.x1 - drag.x0)}
          height={Math.abs(drag.y1 - drag.y0)}
          fill="rgba(46,111,211,0.1)"
          stroke="var(--blue)"
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      )}
    </g>
  );
}
