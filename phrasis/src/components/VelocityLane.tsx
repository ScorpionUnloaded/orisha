import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Axis } from './Timeline';
import type { RollNote } from './PianoRoll';

interface Props {
  notes: RollNote[];
  axis: Axis;
  top: number;
  height: number;
  selected: string[];
  /** Label column. */
  labelX: number;
  onChange: (map: Record<string, number>) => void;
}

/**
 * The piano roll's velocity lane (FL's event editor): drag stems up or down,
 * sweep across several notes to paint velocities, ⇧-drag to draw a straight
 * ramp. With a note selection only the selected notes are edited.
 */
export function VelocityLane({ notes, axis, top, height, selected, labelX, onChange }: Props) {
  const [edit, setEdit] = useState<{ map: Record<string, number>; x0: number; y0: number; x: number; y: number; line: boolean } | null>(null);
  const editRef = useRef(edit);
  const rectRef = useRef<DOMRect | null>(null);
  const sel = new Set(selected);
  const editable = notes.filter((n) => !n.ghost && !n.preview && (!sel.size || sel.has(n.id)));
  const velAt = (y: number) => Math.max(1, Math.min(127, Math.round(((top + height - y) / height) * 127)));
  const yOfVel = (v: number) => top + height - (v / 127) * height;
  const stemX = (n: RollNote) => axis.xOf(n.start) + 1;

  const local = (e: { clientX: number; clientY: number }) => ({ x: e.clientX - rectRef.current!.left, y: e.clientY - rectRef.current!.top });

  /** Notes whose stem lies between two x positions, with the velocity along the stroke. */
  const sweep = (xa: number, ya: number, xb: number, yb: number, into: Record<string, number>) => {
    const lo = Math.min(xa, xb) - 3;
    const hi = Math.max(xa, xb) + 3;
    for (const n of editable) {
      const x = stemX(n);
      if (x < lo || x > hi) continue;
      const t = xb === xa ? 1 : Math.max(0, Math.min(1, (x - xa) / (xb - xa)));
      into[n.id] = velAt(ya + (yb - ya) * t);
    }
    return into;
  };

  // One stroke: listeners are attached on pointer-down and removed on release.
  const stroke = useRef({ move: (_e: PointerEvent) => {}, up: () => {} });
  stroke.current.move = (e: PointerEvent) => {
    const cur = editRef.current;
    if (!cur) return;
    const p = local(e);
    const map = cur.line ? sweep(cur.x0, cur.y0, p.x, p.y, {}) : sweep(cur.x, cur.y, p.x, p.y, { ...cur.map });
    editRef.current = { ...cur, map, x: p.x, y: p.y };
    setEdit(editRef.current);
  };
  stroke.current.up = () => {
    const cur = editRef.current;
    editRef.current = null;
    setEdit(null);
    if (cur && Object.keys(cur.map).length) onChange(cur.map);
  };
  const onWinMove = useRef((e: PointerEvent) => stroke.current.move(e)).current;
  const onWinUp = useRef(() => {
    window.removeEventListener('pointermove', onWinMove);
    window.removeEventListener('pointerup', onWinUp);
    window.removeEventListener('pointercancel', onWinUp);
    stroke.current.up();
  }).current;
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinUp);
    },
    [onWinMove, onWinUp],
  );

  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    rectRef.current = svg.getBoundingClientRect();
    const p = local(e);
    const map = sweep(p.x, p.y, p.x, p.y, {});
    editRef.current = { map, x0: p.x, y0: p.y, x: p.x, y: p.y, line: e.shiftKey };
    setEdit(editRef.current);
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
  };

  const els = notes
    .filter((n) => !n.ghost && !n.preview)
    .map((n) => {
      const x = stemX(n);
      if (x < axis.x0 - 2 || x > axis.x1 + 2) return null;
      const v = edit?.map[n.id] ?? n.vel;
      const y = yOfVel(v);
      const on = sel.has(n.id);
      const dim = sel.size > 0 && !on;
      return (
        <g key={n.id} className={`vel-stem ${on ? 'sel' : ''} ${dim ? 'dim' : ''} ${n.mute ? 'muted' : ''}`} pointerEvents="none">
          <line x1={x} x2={x} y1={top + height} y2={y} />
          <circle cx={x} cy={y} r={3.2} />
        </g>
      );
    });

  const shown = edit ? Object.values(edit.map) : [];
  return (
    <g className="vel-lane">
      <text x={labelX} y={top + height / 2 + 4} className="axis-label" fontSize={12}>
        Velocity
      </text>
      <rect x={axis.x0} y={top} width={axis.x1 - axis.x0} height={height} className="vel-bg" onPointerDown={onDown} style={{ cursor: 'ns-resize' }}>
        <title>Drag to set velocities · sweep across notes to paint · ⇧-drag for a straight ramp</title>
      </rect>
      <line x1={axis.x0} x2={axis.x1} y1={yOfVel(64)} y2={yOfVel(64)} className="vel-mid" pointerEvents="none" />
      {els}
      {edit?.line && <line x1={edit.x0} y1={edit.y0} x2={edit.x} y2={edit.y} className="vel-ramp" pointerEvents="none" />}
      {edit && shown.length > 0 && (
        <text x={Math.min(axis.x1 - 30, edit.x + 8)} y={Math.max(top + 10, edit.y - 6)} className="vel-readout" pointerEvents="none">
          {shown.length === 1 ? shown[0] : `${Math.min(...shown)}–${Math.max(...shown)}`}
        </text>
      )}
    </g>
  );
}
