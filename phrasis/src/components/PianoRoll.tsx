import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { inScale, isBlackKey, prettyPitch } from '../model/theory';
import type { ScaleRef } from '../model/types';
import { audition } from '../store/store';
import type { RollTool } from '../store/store';
import type { Axis } from './Timeline';

export type { RollTool };

export interface RollNote {
  id: string;
  pitch: number;
  /** Tick on the axis. */
  start: number;
  dur: number;
  vel: number;
  ghost?: boolean;
  preview?: boolean;
  mute?: boolean;
  /** Fill override (e.g. colour by drawing). */
  color?: string;
}

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
  /** Shade notes by velocity. */
  velocityShade?: boolean;
  /** Pitches currently sounding, lit on the keyboard. */
  sounding?: ReadonlySet<number>;
  /** Chord stamp: the pitches to create when a root is drawn. */
  stamp?: (root: number) => number[];
  /** Pitch quantiser for drawn notes (snap to scale). */
  quantizePitch?: (pitch: number, tick: number) => number;
  onSelect?: (ids: string[], additive: boolean) => void;
  onMove?: (ids: string[], dTick: number, dPitch: number, copy: boolean) => void;
  onResize?: (ids: string[], dDur: number, edge: 'start' | 'end') => void;
  onAdd?: (tick: number, pitch: number, dur: number) => void;
  /** Several notes at once (paint strokes, chord stamps). */
  onAddMany?: (notes: Array<{ start: number; pitch: number; dur: number }>) => void;
  onDelete?: (ids: string[]) => void;
  onMute?: (ids: string[]) => void;
  onSlice?: (ids: string[], tick: number) => void;
  onScrub?: (tick: number) => void;
  /** A note was clicked (FL: new notes take the length of the last clicked note). */
  onNoteClick?: (n: RollNote) => void;
  onNoteDoubleClick?: (n: RollNote) => void;
  /** ⌘/Ctrl-click on a key. */
  onKeySelect?: (pitch: number, additive: boolean) => void;
  /** Right-click on an empty cell (client coordinates). */
  onContextMenu?: (client: { x: number; y: number }, at: { tick: number; pitch: number }) => void;
  onHover?: (at: { tick: number; pitch: number; note?: RollNote } | null) => void;
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

type NoteDrag = {
  kind: 'move' | 'resize' | 'resize-start';
  ids: string[];
  x0: number;
  y0: number;
  dTick: number;
  dPitch: number;
  copy: boolean;
  moved: boolean;
  hit: RollNote;
};

type Drag =
  | NoteDrag
  | { kind: 'create'; tick: number; pitch: number; x0: number; y0: number; dTick: number; dPitch: number }
  | { kind: 'paint'; cells: Array<{ start: number; pitch: number }>; origin: number }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: 'erase'; ids: string[]; right: boolean; x0: number; y0: number; moved: boolean }
  | { kind: 'mute'; ids: string[] }
  | { kind: 'slice'; tick: number; y0: number; y1: number }
  | { kind: 'scrub'; tick: number }
  | { kind: 'keys'; pitch: number };

const CURSOR: Record<RollTool, string> = {
  pointer: 'default',
  select: 'crosshair',
  draw: 'copy',
  paint: 'cell',
  slice: 'col-resize',
  erase: 'not-allowed',
  mute: 'pointer',
  scrub: 'ew-resize',
};

export function PianoRoll(props: Props) {
  const { axis, top, height, keysX, notes, snap, fifths } = props;
  const keysW = props.keysW ?? 44;
  const range = props.range ?? rollRange(notes.filter((n) => !n.ghost).map((n) => n.pitch));
  const rows = range.hi - range.lo + 1;
  const rowH = height / rows;
  const yOf = (pitch: number) => top + (range.hi - pitch) * rowH;
  const pitchOf = (y: number) => Math.max(range.lo, Math.min(range.hi, range.hi - Math.floor((y - top) / rowH)));
  const [drag, setDragState] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ pitch: number; tick: number } | null>(null);
  const hoverKey = useRef('');
  const dragRef = useRef<Drag | null>(null);
  const rootRef = useRef<SVGGElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const selected = new Set(props.selected);
  const tool = props.tool ?? 'pointer';
  const editable = (n: RollNote) => !props.readOnly && !n.ghost && !n.preview;

  // Window-level listeners keep a drag alive when the pointer leaves the note it started on.
  // They are attached synchronously on pointer-down so that no early move or release is missed.
  const handlers = useRef<{ move: (e: PointerEvent) => void; end: (e: PointerEvent) => void } | null>(null);
  const listening = useRef(false);
  const onWinMove = useRef((e: PointerEvent) => handlers.current?.move(e)).current;
  const onWinUp = useRef((e: PointerEvent) => {
    window.removeEventListener('pointermove', onWinMove);
    window.removeEventListener('pointerup', onWinUp);
    window.removeEventListener('pointercancel', onWinUp);
    listening.current = false;
    handlers.current?.end(e);
  }).current;
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinUp);
    },
    [onWinMove, onWinUp],
  );
  const setDrag = (d: Drag | null) => {
    if (d && !listening.current) {
      listening.current = true;
      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);
    }
    dragRef.current = d;
    setDragState(d);
  };
  const svgRect = () => {
    const svg = rootRef.current?.ownerSVGElement;
    return svg ? svg.getBoundingClientRect() : new DOMRect();
  };
  const local = (e: { clientX: number; clientY: number }, fresh = false) => {
    if (fresh || !rectRef.current) rectRef.current = svgRect();
    return { x: e.clientX - rectRef.current.left, y: e.clientY - rectRef.current.top };
  };
  const grid = (free: boolean) => (free ? 1 : Math.max(1, snap));
  const snapRound = (t: number, free: boolean) => Math.round(t / grid(free)) * grid(free);
  const snapFloor = (t: number, free: boolean) => Math.floor(t / grid(free)) * grid(free);
  const quant = (pitch: number, tick: number) => (props.quantizePitch ? props.quantizePitch(pitch, tick) : pitch);
  const hitNote = (x: number, y: number) => {
    const tick = axis.tickOf(x);
    const pitch = pitchOf(y);
    return notes.find((n) => editable(n) && n.pitch === pitch && tick >= n.start && tick < n.start + n.dur);
  };
  const beep = (pitches: number[], dur = 220, vel = 84) => audition(pitches.map((p, i) => ({ id: `a${i}`, pitch: p, start: 0, dur, vel })));

  // ---------------------------------------------------------------- pointer down

  const onNoteDown = (e: ReactPointerEvent, n: RollNote, edge?: 'resize' | 'resize-start') => {
    if (!editable(n)) return;
    e.stopPropagation();
    const p = local(e, true);
    if (e.button === 2) {
      setDrag({ kind: 'erase', ids: [n.id], right: true, x0: p.x, y0: p.y, moved: false });
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'erase') {
      setDrag({ kind: 'erase', ids: [n.id], right: false, x0: p.x, y0: p.y, moved: false });
      return;
    }
    if (tool === 'mute') {
      setDrag({ kind: 'mute', ids: [n.id] });
      return;
    }
    if (tool === 'slice' || tool === 'scrub') {
      onBgDown(e);
      return;
    }
    const toggle = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    let ids = props.selected;
    if (toggle) {
      if (selected.has(n.id)) {
        props.onSelect?.(props.selected.filter((x) => x !== n.id), false);
        return;
      }
      ids = [...props.selected, n.id];
      props.onSelect?.(ids, false);
    } else if (!selected.has(n.id)) {
      ids = shift ? [...props.selected, n.id] : [n.id];
      props.onSelect?.(ids, false);
    }
    props.onNoteClick?.(n);
    beep([n.pitch], Math.min(n.dur, 480), n.vel);
    setDrag({ kind: edge ?? 'move', ids, x0: p.x, y0: p.y, dTick: 0, dPitch: 0, copy: shift, moved: false, hit: n });
  };

  const onBgDown = (e: ReactPointerEvent) => {
    if (props.readOnly) return;
    const p = local(e, true);
    if (p.x < axis.x0 || p.x > axis.x1 || p.y < top || p.y > top + height) return;
    const tick = axis.tickOf(p.x);
    const pitch = pitchOf(p.y);
    if (e.button === 2) {
      setDrag({ kind: 'erase', ids: [], right: true, x0: p.x, y0: p.y, moved: false });
      return;
    }
    if (e.button !== 0) return;
    const marquee = () => setDrag({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.shiftKey });
    switch (tool) {
      case 'draw': {
        if (e.ctrlKey || e.metaKey) return marquee();
        const start = snapFloor(tick, e.altKey);
        const root = quant(pitch, start);
        beep(props.stamp ? props.stamp(root) : [root]);
        setDrag({ kind: 'create', tick: start, pitch: root, x0: p.x, y0: p.y, dTick: 0, dPitch: 0 });
        return;
      }
      case 'paint': {
        if (e.ctrlKey || e.metaKey) return marquee();
        const start = snapFloor(tick, e.altKey);
        const root = quant(pitch, start);
        beep([root], 160);
        setDrag({ kind: 'paint', cells: [{ start, pitch: root }], origin: start });
        return;
      }
      case 'erase': {
        const hit = hitNote(p.x, p.y);
        setDrag({ kind: 'erase', ids: hit ? [hit.id] : [], right: false, x0: p.x, y0: p.y, moved: false });
        return;
      }
      case 'mute': {
        const hit = hitNote(p.x, p.y);
        setDrag({ kind: 'mute', ids: hit ? [hit.id] : [] });
        return;
      }
      case 'slice':
        setDrag({ kind: 'slice', tick: snapRound(tick, e.altKey), y0: p.y, y1: p.y });
        return;
      case 'scrub': {
        props.onScrub?.(tick);
        const here = notes.filter((n) => !n.mute && !n.ghost && tick >= n.start && tick < n.start + n.dur);
        if (here.length) beep(here.map((n) => n.pitch), 200);
        setDrag({ kind: 'scrub', tick });
        return;
      }
      default:
        marquee();
    }
  };

  // ---------------------------------------------------------------- drag

  const onDragMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = local(e);
    const free = e.altKey;
    switch (d.kind) {
      case 'marquee':
        setDrag({ ...d, x1: p.x, y1: p.y });
        return;
      case 'erase':
      case 'mute': {
        const hit = hitNote(p.x, p.y);
        const moved = d.kind === 'erase' && (d.moved || Math.hypot(p.x - d.x0, p.y - d.y0) > 3);
        if (hit && !d.ids.includes(hit.id)) setDrag({ ...d, ids: [...d.ids, hit.id], ...(d.kind === 'erase' ? { moved } : {}) } as Drag);
        else if (d.kind === 'erase' && moved !== d.moved) setDrag({ ...d, moved });
        return;
      }
      case 'slice':
        setDrag({ ...d, y1: p.y });
        return;
      case 'scrub': {
        const t = axis.tickOf(Math.max(axis.x0, Math.min(axis.x1, p.x)));
        const a = Math.min(t, d.tick);
        const b = Math.max(t, d.tick);
        const crossed = notes.filter((n) => !n.mute && !n.ghost && n.start >= a && n.start < b);
        if (crossed.length) beep(crossed.map((n) => n.pitch), 200);
        props.onScrub?.(t);
        setDrag({ ...d, tick: t });
        return;
      }
      case 'keys': {
        const pitch = pitchOf(p.y);
        if (pitch !== d.pitch) {
          beep([pitch], 300);
          setDrag({ ...d, pitch });
        }
        return;
      }
      case 'create': {
        const raw = axis.tickOf(p.x) - axis.tickOf(d.x0);
        const dTick = Math.max(-d.tick, snapRound(d.tick + raw, free) - d.tick);
        const target = quant(pitchOf(p.y), d.tick + dTick);
        const dPitch = target - d.pitch;
        if (dPitch !== d.dPitch) beep(props.stamp ? props.stamp(target) : [target], 160);
        if (dTick !== d.dTick || dPitch !== d.dPitch) setDrag({ ...d, dTick, dPitch });
        return;
      }
      case 'paint': {
        const step = Math.max(grid(free), props.noteLength);
        const t = snapFloor(axis.tickOf(Math.max(axis.x0, Math.min(axis.x1 - 1, p.x))), free);
        const k = Math.floor((t - d.origin) / step);
        const start = d.origin + k * step;
        if (d.cells.some((c) => c.start === start)) return;
        const pitch = quant(pitchOf(p.y), start);
        beep([pitch], 140);
        setDrag({ ...d, cells: [...d.cells, { start, pitch }] });
        return;
      }
      default: {
        const nd = d as NoteDrag;
        const raw = axis.tickOf(p.x) - axis.tickOf(nd.x0);
        const h = nd.hit;
        const g = grid(free);
        // Small horizontal wobble keeps the time (so pitch-only drags do not snap off-grid notes).
        const still = Math.abs(raw) < g / 2;
        const minDur = Math.max(30, Math.min(g, h.dur));
        let dTick = 0;
        if (still) dTick = 0;
        else if (nd.kind === 'move') dTick = Math.max(-h.start, snapRound(h.start + raw, free) - h.start);
        else if (nd.kind === 'resize') dTick = Math.max(minDur - h.dur, snapRound(h.start + h.dur + raw, free) - (h.start + h.dur));
        else dTick = Math.max(-h.start, Math.min(h.dur - minDur, snapRound(h.start + raw, free) - h.start));
        const dPitch = nd.kind === 'move' ? Math.round((nd.y0 - p.y) / rowH) : 0;
        const moved = nd.moved || Math.abs(p.x - nd.x0) > 3 || Math.abs(p.y - nd.y0) > 3;
        if (dTick !== nd.dTick || dPitch !== nd.dPitch || moved !== nd.moved) {
          if (nd.kind === 'move' && dPitch !== nd.dPitch) beep([h.pitch + dPitch], 180, 80);
          setDrag({ ...nd, dTick, dPitch, moved });
        }
      }
    }
  };

  const onDragEnd = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    rectRef.current = null;
    switch (d.kind) {
      case 'marquee': {
        const xa = Math.min(d.x0, d.x1);
        const xb = Math.max(d.x0, d.x1);
        const ya = Math.min(d.y0, d.y1);
        const yb = Math.max(d.y0, d.y1);
        if (xb - xa < 3 && yb - ya < 3) {
          if (!d.additive) props.onSelect?.([], false);
          return;
        }
        const hits = notes.filter((n) => {
          if (!editable(n)) return false;
          const nx = axis.xOf(n.start);
          const nx2 = axis.xOf(n.start + n.dur);
          const ny = yOf(n.pitch);
          return nx2 >= xa && nx <= xb && ny + rowH >= ya && ny <= yb;
        });
        props.onSelect?.(
          hits.map((n) => n.id),
          d.additive,
        );
        return;
      }
      case 'erase':
        if (d.ids.length) props.onDelete?.(d.ids);
        else if (d.right && !d.moved) {
          const p = local(e, true);
          props.onContextMenu?.({ x: e.clientX, y: e.clientY }, { tick: axis.tickOf(p.x), pitch: pitchOf(p.y) });
        }
        return;
      case 'mute':
        if (d.ids.length) props.onMute?.(d.ids);
        return;
      case 'slice': {
        const a = pitchOf(Math.min(d.y0, d.y1));
        const b = pitchOf(Math.max(d.y0, d.y1));
        const ids = notes.filter((n) => editable(n) && n.pitch <= a && n.pitch >= b && d.tick > n.start && d.tick < n.start + n.dur).map((n) => n.id);
        if (ids.length) props.onSlice?.(ids, d.tick);
        return;
      }
      case 'create': {
        const start = d.tick + d.dTick;
        const root = d.pitch + d.dPitch;
        const pitches = props.stamp ? props.stamp(root) : [root];
        if (pitches.length > 1 && props.onAddMany) props.onAddMany(pitches.map((pitch) => ({ start, pitch, dur: props.noteLength })));
        else props.onAdd?.(start, root, props.noteLength);
        return;
      }
      case 'paint': {
        const cells = d.cells.flatMap((c) => (props.stamp ? props.stamp(c.pitch) : [c.pitch]).map((pitch) => ({ start: c.start, pitch, dur: props.noteLength })));
        if (props.onAddMany) props.onAddMany(cells);
        else cells.forEach((c) => props.onAdd?.(c.start, c.pitch, c.dur));
        return;
      }
      case 'scrub':
      case 'keys':
        return;
      default: {
        const nd = d as NoteDrag;
        if (!nd.moved) return;
        if (nd.kind === 'move' && (nd.dTick || nd.dPitch)) props.onMove?.(nd.ids, nd.dTick, nd.dPitch, nd.copy);
        else if (nd.kind === 'move' && nd.copy) props.onMove?.(nd.ids, 0, 0, true);
        else if (nd.kind === 'resize' && nd.dTick) props.onResize?.(nd.ids, nd.dTick, 'end');
        else if (nd.kind === 'resize-start' && nd.dTick) props.onResize?.(nd.ids, nd.dTick, 'start');
      }
    }
  };

  handlers.current = { move: onDragMove, end: onDragEnd };

  const onHoverMove = (e: ReactPointerEvent) => {
    if (dragRef.current) return;
    const p = local(e, true);
    if (p.x < axis.x0 || p.x > axis.x1 || p.y < top || p.y > top + height) {
      if (hover) {
        hoverKey.current = '';
        setHover(null);
        props.onHover?.(null);
      }
      return;
    }
    const pitch = pitchOf(p.y);
    const tick = axis.tickOf(p.x);
    const note = notes.find((n) => !n.ghost && n.pitch === pitch && tick >= n.start && tick < n.start + n.dur);
    // Re-render only when the cell (pitch, 1/64 step) or the note under the pointer changes.
    const key = `${pitch}:${Math.floor(tick / 30)}:${note?.id ?? ''}`;
    if (key === hoverKey.current) return;
    hoverKey.current = key;
    setHover({ pitch, tick });
    props.onHover?.({ pitch, tick, note });
  };
  const onHoverLeave = () => {
    if (dragRef.current) return;
    hoverKey.current = '';
    setHover(null);
    props.onHover?.(null);
  };

  // ---------------------------------------------------------------- rendering

  const rowsEls: ReactElement[] = [];
  const whiteKeys: ReactElement[] = [];
  const blackKeys: ReactElement[] = [];
  const hoverPitch = drag?.kind === 'keys' ? drag.pitch : hover?.pitch;
  for (let p = range.hi; p >= range.lo; p--) {
    const y = yOf(p);
    const black = isBlackKey(p);
    const outOfScale = props.scaleHighlight && props.scale ? !inScale(p, props.scale) : false;
    rowsEls.push(<rect key={`r${p}`} x={axis.x0} y={y} width={axis.x1 - axis.x0} height={rowH} className={`roll-row ${outOfScale ? 'out' : black ? 'black' : 'white'} ${props.scale && p % 12 === props.scale.tonic ? 'tonic' : ''}`} />);
    if (p % 12 === 0 || p % 12 === 5) rowsEls.push(<line key={`rl${p}`} x1={axis.x0} x2={axis.x1} y1={y + rowH} y2={y + rowH} className="roll-octave" />);
    const lit = props.sounding?.has(p);
    const hot = hoverPitch === p;
    (black ? blackKeys : whiteKeys).push(
      <rect
        key={`k${p}`}
        x={keysX}
        y={y}
        width={black ? keysW * 0.62 : keysW}
        height={rowH}
        className={`roll-key ${black ? 'black' : 'white'} ${lit ? 'lit' : ''} ${hot ? 'hot' : ''}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          if ((e.ctrlKey || e.metaKey) && props.onKeySelect) {
            props.onKeySelect(p, e.shiftKey);
            return;
          }
          local(e, true);
          beep([p], 360, 90);
          setDrag({ kind: 'keys', pitch: p });
        }}
      >
        <title>{`${prettyPitch(p, fifths)}${props.onKeySelect ? ' · ⌘-click selects every note of this pitch' : ''}`}</title>
      </rect>,
    );
  }
  const keys = [...whiteKeys, ...blackKeys];

  const gridEls: ReactElement[] = [];
  const beat = axis.beatLen;
  const px = (t: number) => axis.xOf(axis.startTick + t) - axis.x0;
  const fine = snap >= 30 && px(snap) >= 7 && snap < beat ? snap : px(beat / 2) >= 14 ? beat / 2 : beat;
  for (let b = axis.startBar; b < axis.startBar + axis.bars; b++) {
    if (b % 2 === 1) gridEls.push(<rect key={`alt${b}`} x={axis.xOf(b * axis.barLen)} y={top} width={axis.xOf((b + 1) * axis.barLen) - axis.xOf(b * axis.barLen)} height={height} className="roll-altbar" />);
  }
  for (let t = axis.startTick; t <= axis.endTick + 0.5; t += fine) {
    const x = axis.xOf(t);
    const isBar = Math.abs(t % axis.barLen) < 0.5 || Math.abs((t % axis.barLen) - axis.barLen) < 0.5;
    const isBeat = Math.abs(t % beat) < 0.5 || Math.abs((t % beat) - beat) < 0.5;
    gridEls.push(<line key={`g${t}`} x1={x} x2={x} y1={top} y2={top + height} className={isBar ? 'grid-bar' : isBeat ? 'grid-beat' : 'grid-sub'} />);
  }

  const labels: ReactElement[] = [];
  for (let p = range.lo; p <= range.hi; p++) {
    if (p % 12 !== 0) continue;
    labels.push(
      <text key={`lab${p}`} x={keysX + keysW + 8} y={yOf(p) + rowH / 2 + 4.5} fontSize={12.5} fill="var(--text-2)" pointerEvents="none">
        {`C${p / 12 - 1}`}
      </text>,
    );
  }

  const noteDrag = drag && (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'resize-start') && drag.moved ? drag : null;
  const movingIds = new Set(noteDrag?.ids ?? []);
  const erasing = new Set(drag?.kind === 'erase' ? drag.ids : []);
  const muting = new Set(drag?.kind === 'mute' ? drag.ids : []);
  const h = Math.max(3, rowH - (props.compressed ? 1 : 1.5));
  const noteCursor = tool === 'erase' ? 'not-allowed' : tool === 'mute' ? 'pointer' : tool === 'slice' ? 'col-resize' : 'grab';

  const noteEls = notes.map((n) => {
    let start = n.start;
    let dur = n.dur;
    let pitch = n.pitch;
    const moving = noteDrag && movingIds.has(n.id);
    if (moving) {
      if (noteDrag.kind === 'move') {
        start += noteDrag.dTick;
        pitch += noteDrag.dPitch;
      } else if (noteDrag.kind === 'resize') dur = Math.max(30, dur + noteDrag.dTick);
      else {
        start += noteDrag.dTick;
        dur = Math.max(30, dur - noteDrag.dTick);
      }
    }
    const x = axis.xOf(start);
    const w = Math.max(3, axis.xOf(start + dur) - x - 1);
    if (x + w < axis.x0 || x > axis.x1 || pitch < range.lo || pitch > range.hi) return null;
    const y = yOf(pitch);
    const sel = selected.has(n.id);
    const muted = muting.has(n.id) ? !n.mute : n.mute;
    const shade = props.velocityShade ? 0.42 + 0.58 * (n.vel / 127) : 0.94;
    const fill = n.ghost ? '#c3c2bf' : n.preview ? 'var(--orange)' : muted ? 'var(--note-muted)' : sel ? 'var(--note-sel)' : n.color ?? 'var(--note)';
    const edgeW = Math.min(7, w / 3);
    return (
      <g key={n.id} opacity={erasing.has(n.id) ? 0.22 : 1}>
        {moving && noteDrag.copy && <rect x={axis.xOf(n.start)} y={yOf(n.pitch) + 0.75} width={Math.max(3, axis.xOf(n.start + n.dur) - axis.xOf(n.start) - 1)} height={h} rx={2} fill="var(--note)" opacity={0.35} pointerEvents="none" />}
        <rect
          x={x}
          y={y + 0.75}
          width={w}
          height={h}
          rx={2}
          fill={fill}
          stroke={n.ghost ? 'none' : sel ? 'var(--note-sel-edge)' : muted ? '#8f8e8a' : 'var(--note-edge)'}
          strokeWidth={sel ? 1.3 : 0.6}
          strokeDasharray={muted ? '2 1.5' : undefined}
          opacity={n.ghost ? 0.7 : n.preview ? 0.85 : muted ? 0.75 : shade}
          style={{ cursor: !editable(n) ? 'default' : noteCursor }}
          onPointerDown={(e) => onNoteDown(e, n)}
          onDoubleClick={() => editable(n) && tool !== 'erase' && tool !== 'mute' && props.onNoteDoubleClick?.(n)}
        >
          <title>{`${prettyPitch(pitch, fifths)}${props.describe ? ` · ${props.describe({ ...n, pitch })}` : ''} · vel ${n.vel}${n.mute ? ' · muted' : ''}`}</title>
        </rect>
        {editable(n) && tool !== 'erase' && tool !== 'mute' && tool !== 'slice' && w > 9 && (
          <>
            <rect x={x + w - edgeW} y={y + 0.75} width={edgeW + 2} height={h} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={(e) => onNoteDown(e, n, 'resize')} />
            {w > 16 && <rect x={x - 1} y={y + 0.75} width={edgeW} height={h} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={(e) => onNoteDown(e, n, 'resize-start')} />}
          </>
        )}
        {props.showNames && w > 20 && h >= 9 && (
          <text x={x + 3} y={y + 0.75 + h / 2 + 3.6} fontSize={Math.min(10, h - 1)} className="roll-name" pointerEvents="none">
            {prettyPitch(pitch, fifths, true)}
          </text>
        )}
      </g>
    );
  });

  // Pending notes (draw / paint / stamp) before they are committed.
  const pending: ReactElement[] = [];
  const pend = (key: string, start: number, pitch: number) => {
    if (pitch < range.lo || pitch > range.hi) return;
    const x = axis.xOf(start);
    const w = Math.max(3, axis.xOf(start + props.noteLength) - x - 1);
    pending.push(<rect key={key} x={x} y={yOf(pitch) + 0.75} width={w} height={h} rx={2} className="roll-pending" pointerEvents="none" />);
  };
  if (drag?.kind === 'create') {
    const root = drag.pitch + drag.dPitch;
    (props.stamp ? props.stamp(root) : [root]).forEach((p, i) => pend(`c${i}`, drag.tick + drag.dTick, p));
  }
  if (drag?.kind === 'paint') drag.cells.forEach((c, i) => (props.stamp ? props.stamp(c.pitch) : [c.pitch]).forEach((p, j) => pend(`p${i}-${j}`, c.start, p)));

  // Ghost of the note that the draw tool would create under the pointer.
  const showGhost = !drag && hover && (tool === 'draw' || tool === 'paint') && !props.readOnly && !notes.some((n) => !n.ghost && n.pitch === hover.pitch && hover.tick >= n.start && hover.tick < n.start + n.dur);
  if (showGhost) {
    const start = Math.floor(hover.tick / grid(false)) * grid(false);
    const root = quant(hover.pitch, start);
    (props.stamp ? props.stamp(root) : [root]).forEach((p, i) => {
      if (p < range.lo || p > range.hi) return;
      const x = axis.xOf(start);
      pending.push(<rect key={`g${i}`} x={x} y={yOf(p) + 0.75} width={Math.max(3, axis.xOf(start + props.noteLength) - x - 1)} height={h} rx={2} className="roll-ghost" pointerEvents="none" />);
    });
  }

  return (
    <g ref={rootRef} onContextMenu={(e) => e.preventDefault()} onPointerMove={onHoverMove} onPointerLeave={onHoverLeave}>
      <g onPointerDown={onBgDown} onDoubleClick={(e) => {
        if (props.readOnly || (tool !== 'pointer' && tool !== 'select')) return;
        const p = local(e, true);
        if (p.x < axis.x0 || p.x > axis.x1) return;
        const start = snapFloor(axis.tickOf(p.x), e.altKey);
        props.onAdd?.(start, quant(pitchOf(p.y), start), props.noteLength);
      }} style={{ cursor: CURSOR[tool] }}>
        {rowsEls}
        {gridEls}
        {hover && !drag && <rect x={axis.x0} y={yOf(hover.pitch)} width={axis.x1 - axis.x0} height={rowH} className="roll-hover" />}
        <rect x={axis.x0} y={top} width={axis.x1 - axis.x0} height={height} fill="transparent" />
      </g>
      {keys}
      {labels}
      <rect x={keysX} y={top} width={keysW} height={height} fill="none" stroke="#cfcdc9" strokeWidth={0.8} pointerEvents="none" />
      {props.children}
      {noteEls}
      {pending}
      {drag?.kind === 'slice' && (
        <line x1={axis.xOf(drag.tick)} x2={axis.xOf(drag.tick)} y1={Math.min(drag.y0, drag.y1) - 4} y2={Math.max(drag.y0, drag.y1) + 4} className="roll-slice" pointerEvents="none" />
      )}
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
