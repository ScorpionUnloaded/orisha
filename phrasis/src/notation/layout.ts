/**
 * Staff engraving: turns notes into positioned SVG primitives.
 *
 * Layout is split in three phases so that every staff in the app can share one
 * time axis with the piano roll:
 *   1. buildBars   – quantised events per bar (notes, rests, ties, beams, accidentals)
 *   2. a mapping   – tick → x, either supplied by the caller (proportional, aligned
 *                    with other views) or computed from the events (compact)
 *   3. engrave     – glyphs, stems, beams, slurs, ties
 */
import { diatonicIndex, keySignatureAlters, spellPitch } from '../model/theory';
import { T16, TPQ } from '../model/types';
import type { Articulation, Meter, Note } from '../model/types';
import { accidentalGlyph, G, M } from './glyphs';

export type Clef = 'treble' | 'bass' | 'percussion';

export interface Head {
  pos: number;
  noteId?: string;
  pitch?: number;
  /** Alteration to print (0 prints a natural); undefined prints nothing. */
  acc?: number;
  x?: boolean;
  tieToNext?: boolean;
  tieFromPrev?: boolean;
  art?: Articulation;
  slur?: 'start' | 'end';
}

export interface Ev {
  kind: 'note' | 'rest';
  tick: number;
  /** Notated length in sixteenths: 1, 2, 3, 4, 6, 8, 12, 16. */
  len16: number;
  heads: Head[];
  bar: number;
  beam?: number;
  fullBarRest?: boolean;
}

export interface BarData {
  index: number;
  start: number;
  end: number;
  events: Ev[];
}

export interface EngraveOptions {
  clef: Clef;
  fifths: number;
  meter: Meter;
  from: number;
  to: number;
  /** Local key for spelling (defaults to the key signature). */
  spellFifths?: (tick: number) => number;
  /** Percussion: staff position(s) and head style for a note. */
  percussion?: (n: Note) => { positions: number[]; x?: boolean[] };
}

const VALUES = [16, 12, 8, 6, 4, 3, 2, 1];
const REST_VALUES = [16, 8, 4, 2, 1];

function alignFor(v: number, den: number): number {
  const base = v === 12 ? 8 : v === 6 ? 4 : v === 3 ? 2 : v;
  if (base >= 16) return 16;
  return Math.min(base, den === 8 ? 2 : 4);
}

/** Decompose a span inside a bar into notatable values. */
export function splitSpan(p: number, len: number, barLen16: number, den: number, rest = false): number[] {
  const out: number[] = [];
  const values = rest ? REST_VALUES : VALUES;
  while (len > 0) {
    let chosen = 1;
    for (const v of values) {
      if (v > len) continue;
      if (v === 16 && barLen16 !== 16) continue;
      if (p % alignFor(v, den) !== 0) continue;
      // Avoid crossing the middle of a 4/4 bar with a value that does not start on it,
      // except for notes that simply run to the end of the bar.
      if (rest && barLen16 === 16 && p < 8 && p + v > 8) continue;
      chosen = v;
      break;
    }
    out.push(chosen);
    p += chosen;
    len -= chosen;
  }
  return out;
}

export function staffPosition(pitch: number, clef: Clef, fifths: number): { pos: number; alter: number; di: number } {
  const s = spellPitch(pitch, fifths);
  const di = diatonicIndex(s);
  const bottom = clef === 'bass' ? 18 : 30; // G2 or E4 on the bottom line
  return { pos: di - bottom, alter: s.alter, di };
}

export function buildBars(notes: Note[], opts: EngraveOptions): BarData[] {
  const barLen = (TPQ * 4 * opts.meter.num) / opts.meter.den;
  const barLen16 = barLen / T16;
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const firstBar = Math.floor(opts.from / barLen);
  const lastBar = Math.ceil(opts.to / barLen);
  const keyAlters = keySignatureAlters(opts.fifths);

  // Quantise to sixteenths and group simultaneous onsets into chords.
  interface Chord {
    s: number;
    e: number;
    notes: Note[];
  }
  const chords: Chord[] = [];
  for (const n of sortedNotes) {
    const s = Math.round(n.start / T16);
    const e = Math.max(s + 1, Math.round((n.start + n.dur) / T16));
    const last = chords[chords.length - 1];
    if (last && last.s === s) {
      last.notes.push(n);
      last.e = Math.max(last.e, e);
    } else chords.push({ s, e, notes: [n] });
  }
  for (let i = 0; i + 1 < chords.length; i++) chords[i].e = Math.min(chords[i].e, chords[i + 1].s);

  const bars: BarData[] = [];
  let beamId = 0;
  for (let b = firstBar; b < lastBar; b++) {
    const b16 = b * barLen16;
    const e16 = b16 + barLen16;
    const events: Ev[] = [];
    const accState = new Map<number, number>();
    const inBar = chords.filter((c) => c.e > b16 && c.s < e16);
    let cursor = b16;
    const pushRest = (from: number, to: number) => {
      for (const v of splitSpan(from - b16, to - from, barLen16, opts.meter.den, true)) {
        events.push({ kind: 'rest', tick: from * T16, len16: v, heads: [], bar: b });
        from += v;
      }
    };
    for (const c of inBar) {
      const s = Math.max(c.s, b16);
      const e = Math.min(c.e, e16);
      if (s > cursor) pushRest(cursor, s);
      const pieces = splitSpan(s - b16, e - s, barLen16, opts.meter.den);
      let t = s;
      pieces.forEach((v, pi) => {
        const firstPiece = pi === 0;
        const lastPiece = pi === pieces.length - 1;
        const heads: Head[] = c.notes.map((n) => {
          const tieFromPrev = !firstPiece || c.s < b16;
          const tieToNext = !lastPiece || c.e > e16;
          if (opts.clef === 'percussion') {
            const perc = opts.percussion?.(n) ?? { positions: [4] };
            return { pos: perc.positions[0], x: perc.x?.[0], noteId: n.id, pitch: n.pitch, tieFromPrev, tieToNext, art: firstPiece && c.s >= b16 ? n.art : undefined, slur: firstPiece ? n.slur : undefined };
          }
          const spellK = opts.spellFifths ? opts.spellFifths(n.start) : opts.fifths;
          const { pos, alter, di } = staffPosition(n.pitch, opts.clef, spellK);
          const current = accState.has(di) ? accState.get(di)! : keyAlters[((di % 7) + 7) % 7];
          let acc: number | undefined;
          if (!tieFromPrev && current !== alter) acc = alter;
          accState.set(di, alter);
          return {
            pos,
            noteId: n.id,
            pitch: n.pitch,
            acc,
            tieFromPrev,
            tieToNext,
            art: firstPiece && c.s >= b16 ? n.art : undefined,
            slur: n.slur === 'start' ? (firstPiece && c.s >= b16 ? 'start' : undefined) : n.slur === 'end' ? (lastPiece ? 'end' : undefined) : undefined,
          };
        });
        // Percussion chords with multiple lanes.
        if (opts.clef === 'percussion' && opts.percussion) {
          const extra: Head[] = [];
          for (const n of c.notes) {
            const perc = opts.percussion(n);
            perc.positions.slice(1).forEach((pos, k) =>
              extra.push({ pos, x: perc.x?.[k + 1], noteId: n.id, pitch: n.pitch, tieFromPrev: heads[0].tieFromPrev, tieToNext: heads[0].tieToNext }),
            );
          }
          heads.push(...extra);
        }
        heads.sort((a, b2) => a.pos - b2.pos);
        events.push({ kind: 'note', tick: t * T16, len16: v, heads, bar: b });
        t += v;
      });
      cursor = e;
    }
    if (cursor < e16) {
      if (cursor === b16) events.push({ kind: 'rest', tick: b16 * T16, len16: barLen16, heads: [], bar: b, fullBarRest: true });
      else pushRest(cursor, e16);
    }

    // Beaming: flagged notes within the same beat unit.
    const compound = opts.meter.den === 8 && opts.meter.num % 3 === 0;
    const unit = compound ? 6 : 16 / opts.meter.den >= 4 ? 4 : 16 / opts.meter.den * 2;
    let group: Ev[] = [];
    let groupUnit = -1;
    const groups: Ev[][] = [];
    const flush = () => {
      if (group.length) groups.push(group);
      group = [];
    };
    for (const ev of events) {
      const p = ev.tick / T16 - b16;
      const u = Math.floor(p / unit);
      if (ev.kind === 'note' && ev.len16 < 4) {
        if (u !== groupUnit) flush();
        group.push(ev);
        groupUnit = u;
      } else {
        flush();
        groupUnit = -1;
      }
    }
    flush();
    // Merge two full-beat eighth groups inside the same half bar (4/4 convention).
    const merged: Ev[][] = [];
    for (const g of groups) {
      const prev = merged[merged.length - 1];
      const fullBeat = (gr: Ev[]) => gr.reduce((s, e) => s + e.len16, 0) === unit && gr.every((e) => e.len16 === 2);
      if (
        prev &&
        !compound &&
        barLen16 === 16 &&
        fullBeat(prev) &&
        fullBeat(g) &&
        Math.floor((prev[0].tick / T16 - b16) / 8) === Math.floor((g[0].tick / T16 - b16) / 8) &&
        g[0].tick === prev[prev.length - 1].tick + 2 * T16
      ) {
        prev.push(...g);
      } else merged.push(g);
    }
    for (const g of merged) {
      if (g.length < 2) continue;
      beamId++;
      for (const ev of g) ev.beam = beamId;
    }
    bars.push({ index: b, start: b * barLen, end: (b + 1) * barLen, events });
  }
  return bars;
}

// ---------------------------------------------------------------------------
// Primitives

export type Prim =
  | { t: 'glyph'; x: number; y: number; ch: string; cls?: string; id?: string; size?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; cls?: string; id?: string }
  | { t: 'poly'; points: string; cls?: string; id?: string }
  | { t: 'path'; d: string; cls?: string; id?: string }
  | { t: 'hit'; x: number; y: number; w: number; h: number; id: string; tick: number };

export interface Engraved {
  prims: Prim[];
  /** x of every barline (start of each bar), for overlays. */
  barX: number[];
  /** Notehead centre per note id (first head). */
  heads: Map<string, { x: number; y: number }>;
  preludeWidth: number;
  top: number;
  sp: number;
}

export interface StaffGeometry {
  sp: number;
  /** y of the top staff line. */
  top: number;
  /** Left edge of the staff lines. */
  left: number;
  /** Right edge of the staff lines. */
  right: number;
  /** Where the prelude (clef/key/time) begins. */
  preludeX: number;
  showClef?: boolean;
  showKey?: boolean;
  showTime?: boolean;
  finalBar?: boolean;
  /** Draw only 1 line (rhythm line) instead of 5. */
  singleLine?: boolean;
}

export function preludeWidth(clef: Clef, fifths: number, sp: number, showKey = true, showTime = true): number {
  const clefW = clef === 'percussion' ? M.percClefW : clef === 'bass' ? M.fClefW : M.gClefW;
  let w = 0.6 + clefW + 0.8;
  if (showKey && clef !== 'percussion') w += Math.abs(fifths) * 1.0 + (fifths ? 0.6 : 0);
  if (showTime) w += M.timeSigW + 0.8;
  return w * sp;
}

const FLAT_POS = [4, 7, 3, 6, 2, 5, 1];
const SHARP_POS = [8, 5, 9, 6, 3, 7, 4];

export type XMap = (tick: number) => number;

/**
 * Compact spacing: widths grow with duration; the result is scaled to fit `width`.
 */
export function compactMapping(bars: BarData[], x0: number, width: number, sp: number): XMap {
  const ticks: number[] = [];
  const ws: number[] = [];
  bars.forEach((bar, bi) => {
    bar.events.forEach((ev, ei) => {
      if (ei === 0 && bi > 0 && ws.length) ws[ws.length - 1] += sp * 1.1;
      const hasAcc = ev.heads.some((h) => h.acc !== undefined);
      const dotted = ev.len16 === 3 || ev.len16 === 6 || ev.len16 === 12;
      ticks.push(ev.tick);
      ws.push(sp * (1.5 + 1.15 * Math.log2(ev.len16 + 1)) + (hasAcc ? sp * 1.1 : 0) + (dotted ? sp * 0.5 : 0));
    });
  });
  if (!ticks.length) return () => x0;
  const total = ws.reduce((s, w) => s + w, 0) + sp * 0.6;
  const k = width / total;
  const xs: number[] = [];
  let x = x0;
  for (const w of ws) {
    xs.push(x);
    x += w * k;
  }
  const endTick = bars[bars.length - 1].end;
  ticks.push(endTick);
  xs.push(x0 + width);
  return (tick: number) => {
    if (tick <= ticks[0]) return xs[0];
    for (let i = 1; i < ticks.length; i++) {
      if (tick <= ticks[i]) {
        const f = (tick - ticks[i - 1]) / (ticks[i] - ticks[i - 1] || 1);
        return xs[i - 1] + f * (xs[i] - xs[i - 1]);
      }
    }
    return xs[xs.length - 1];
  };
}

/**
 * Bar-aligned compact spacing: every bar keeps the width given by `barX`
 * (so it lines up with other views) while notes inside it are spaced by duration.
 */
export function barwiseMapping(bars: BarData[], barX: (tick: number) => number, sp: number): XMap {
  const segs: Array<{ start: number; end: number; ticks: number[]; xs: number[] }> = [];
  for (const bar of bars) {
    const x0 = barX(bar.start) + sp * 0.9;
    const x1 = barX(bar.end) - sp * 0.3;
    const ws = bar.events.map((ev) => {
      const dotted = ev.len16 === 3 || ev.len16 === 6 || ev.len16 === 12;
      const hasAcc = ev.heads.some((h) => h.acc !== undefined);
      return 1.3 + 0.9 * Math.log2(ev.len16 + 1) + (dotted ? 0.4 : 0) + (hasAcc ? 0.9 : 0);
    });
    const total = ws.reduce((a, b) => a + b, 0) || 1;
    const k = (x1 - x0) / total;
    const ticks: number[] = [];
    const xs: number[] = [];
    let x = x0;
    bar.events.forEach((ev, i) => {
      ticks.push(ev.tick);
      xs.push(x);
      x += ws[i] * k;
    });
    ticks.push(bar.end);
    xs.push(barX(bar.end));
    segs.push({ start: bar.start, end: bar.end, ticks, xs });
  }
  return (tick: number) => {
    const seg = segs.find((sg) => tick >= sg.start && tick < sg.end) ?? segs[segs.length - 1];
    if (!seg) return barX(tick);
    if (tick >= seg.end) return barX(tick);
    // Bar starts map to the barline itself; engrave() offsets noteheads.
    if (tick === seg.start) return seg.xs[0] - sp * 0.45;
    for (let i = 1; i < seg.ticks.length; i++) {
      if (tick <= seg.ticks[i]) {
        const f = (tick - seg.ticks[i - 1]) / (seg.ticks[i] - seg.ticks[i - 1] || 1);
        return seg.xs[i - 1] + f * (seg.xs[i] - seg.xs[i - 1]) - sp * 0.45;
      }
    }
    return barX(tick);
  };
}

interface Placed {
  ev: Ev;
  x: number;
  stemUp: boolean;
  stemX: number;
  stemTop: number;
  stemBottom: number;
  headW: number;
}

export function engrave(
  bars: BarData[],
  opts: EngraveOptions,
  geo: StaffGeometry,
  xOf: XMap,
  classOf?: (noteId: string | undefined) => string | undefined,
): Engraved {
  const { sp, top } = geo;
  const prims: Prim[] = [];
  const heads = new Map<string, { x: number; y: number }>();
  const y = (pos: number) => top + (8 - pos) * (sp / 2);
  const glyph = (x: number, yy: number, ch: string, cls?: string, id?: string) => prims.push({ t: 'glyph', x, y: yy, ch, cls, id });

  // Staff lines
  if (geo.singleLine) {
    prims.push({ t: 'line', x1: geo.left, y1: y(4), x2: geo.right, y2: y(4), w: M.staffLineW * sp, cls: 'staff' });
  } else {
    for (let i = 0; i < 5; i++) prims.push({ t: 'line', x1: geo.left, y1: y(i * 2), x2: geo.right, y2: y(i * 2), w: M.staffLineW * sp, cls: 'staff' });
  }

  // Prelude
  let px = geo.preludeX + 0.6 * sp;
  if (geo.showClef !== false) {
    if (opts.clef === 'treble') {
      glyph(px, y(2), G.gClef);
      px += (M.gClefW + 0.8) * sp;
    } else if (opts.clef === 'bass') {
      glyph(px, y(6), G.fClef);
      px += (M.fClefW + 0.8) * sp;
    } else {
      glyph(px, y(4), G.percClef);
      px += (M.percClefW + 0.8) * sp;
    }
  }
  if (geo.showKey !== false && opts.clef !== 'percussion' && opts.fifths) {
    const n = Math.abs(opts.fifths);
    const table = opts.fifths < 0 ? FLAT_POS : SHARP_POS;
    const shiftPos = opts.clef === 'bass' ? -2 : 0;
    for (let i = 0; i < n; i++) {
      glyph(px, y(table[i] + shiftPos), opts.fifths < 0 ? G.flat : G.sharp);
      px += 1.0 * sp;
    }
    px += 0.6 * sp;
  }
  if (geo.showTime !== false) {
    const digits = (v: number) => String(v).split('').map((d) => G.timeSig(Number(d))).join('');
    const topStr = digits(opts.meter.num);
    const botStr = digits(opts.meter.den);
    const w = Math.max(topStr.length, botStr.length) * M.timeSigW * sp;
    const cx = px + w / 2;
    prims.push({ t: 'glyph', x: cx - (topStr.length * M.timeSigW * sp) / 2, y: y(6), ch: topStr });
    prims.push({ t: 'glyph', x: cx - (botStr.length * M.timeSigW * sp) / 2, y: y(2), ch: botStr });
    px += w + 0.8 * sp;
  }
  const preludeW = px - geo.preludeX;

  // Barlines
  const barX: number[] = [];
  const staffTopY = geo.singleLine ? y(6) : y(8);
  const staffBotY = geo.singleLine ? y(2) : y(0);
  bars.forEach((bar, i) => {
    const bx = xOf(bar.start) - 0.25 * sp;
    barX.push(bx);
    if (i > 0) prims.push({ t: 'line', x1: bx, y1: staffTopY, x2: bx, y2: staffBotY, w: M.thinBar * sp, cls: 'barline' });
  });
  if (bars.length) {
    const endX = Math.min(geo.right, xOf(bars[bars.length - 1].end) - 0.25 * sp);
    if (geo.finalBar) {
      prims.push({ t: 'line', x1: endX - 0.75 * sp, y1: staffTopY, x2: endX - 0.75 * sp, y2: staffBotY, w: M.thinBar * sp, cls: 'barline' });
      prims.push({ t: 'line', x1: endX - 0.25 * sp, y1: staffTopY, x2: endX - 0.25 * sp, y2: staffBotY, w: M.thickBar * sp, cls: 'barline' });
    } else {
      prims.push({ t: 'line', x1: endX, y1: staffTopY, x2: endX, y2: staffBotY, w: M.thinBar * sp, cls: 'barline' });
    }
  }

  // Notes and rests
  const placed: Placed[] = [];
  const beams = new Map<number, Placed[]>();
  for (const bar of bars) {
    let prevRight = xOf(bar.start) + 0.1 * sp;
    for (const ev of bar.events) {
      const isRest = ev.kind === 'rest';
      const headW = ev.len16 === 16 ? M.wholeW * sp : (ev.heads.some((h) => h.x) ? M.xHeadW : M.headW) * sp;
      const accW = Math.max(0, ...ev.heads.map((h) => (h.acc !== undefined ? accidentalGlyph(h.acc).w + 0.25 : 0))) * sp;
      let x = xOf(ev.tick) + 0.45 * sp;
      x = Math.max(x, prevRight + accW);
      if (ev.fullBarRest) x = (xOf(bar.start) + xOf(bar.end)) / 2 - (M.wholeW * sp) / 2;
      if (isRest) {
        const cls = 'rest';
        switch (ev.len16) {
          case 16:
            glyph(x, y(6), G.restWhole, cls);
            break;
          case 8:
          case 12:
            glyph(x, y(4), G.restHalf, cls);
            break;
          case 4:
          case 6:
            glyph(x, y(4), G.restQuarter, cls);
            break;
          case 2:
          case 3:
            glyph(x, y(4), G.rest8, cls);
            break;
          default:
            glyph(x, y(4), G.rest16, cls);
        }
        if (ev.len16 === 12 || ev.len16 === 6 || ev.len16 === 3) glyph(x + 1.5 * sp, y(5), G.dot, cls);
        prevRight = x + 1.2 * sp;
        continue;
      }
      const lo = ev.heads[0].pos;
      const hi = ev.heads[ev.heads.length - 1].pos;
      const stemUp = opts.clef === 'percussion' ? true : 4 - lo >= hi - 4;
      placed.push({ ev, x, stemUp, stemX: 0, stemTop: 0, stemBottom: 0, headW });
      prevRight = x + headW + (ev.len16 === 3 || ev.len16 === 6 || ev.len16 === 12 ? 0.9 * sp : 0.25 * sp);
      if (ev.beam) {
        const arr = beams.get(ev.beam) ?? [];
        arr.push(placed[placed.length - 1]);
        beams.set(ev.beam, arr);
      }
    }
  }

  // Beam groups share one stem direction.
  for (const group of beams.values()) {
    if (opts.clef === 'percussion') continue;
    const lo = Math.min(...group.map((p) => p.ev.heads[0].pos));
    const hi = Math.max(...group.map((p) => p.ev.heads[p.ev.heads.length - 1].pos));
    const up = 4 - lo >= hi - 4;
    for (const p of group) p.stemUp = up;
  }

  // Stems (default lengths)
  for (const p of placed) {
    const loY = y(p.ev.heads[0].pos);
    const hiY = y(p.ev.heads[p.ev.heads.length - 1].pos);
    const len = 3.4 * sp;
    if (p.stemUp) {
      p.stemX = p.x + p.headW - (M.stemW * sp) / 2;
      p.stemBottom = loY - M.stemAttach * sp;
      p.stemTop = Math.min(hiY - len, y(4));
    } else {
      p.stemX = p.x + (M.stemW * sp) / 2;
      p.stemTop = hiY + M.stemAttach * sp;
      p.stemBottom = Math.max(loY + len, y(4));
    }
  }

  // Beam geometry
  for (const group of beams.values()) {
    const first = group[0];
    const last = group[group.length - 1];
    const up = first.stemUp;
    const tipOf = (p: Placed) => (up ? p.stemTop : p.stemBottom);
    let slope = (tipOf(last) - tipOf(first)) / Math.max(1, last.stemX - first.stemX);
    slope = Math.max(-0.18, Math.min(0.18, slope));
    const maxBeams = Math.max(...group.map((p) => (p.ev.len16 === 1 ? 2 : 1)));
    const minLen = (2.6 + (maxBeams - 1) * 0.5) * sp;
    // Offset so that every stem keeps a minimum length.
    let offset = up ? Infinity : -Infinity;
    for (const p of group) {
      const headY = up ? y(p.ev.heads[p.ev.heads.length - 1].pos) : y(p.ev.heads[0].pos);
      const need = up ? headY - minLen : headY + minLen;
      const lineAt = slope * (p.stemX - first.stemX);
      offset = up ? Math.min(offset, need - lineAt) : Math.max(offset, need - lineAt);
    }
    const beamY = (x: number) => offset + slope * (x - first.stemX);
    for (const p of group) {
      if (up) p.stemTop = beamY(p.stemX);
      else p.stemBottom = beamY(p.stemX);
    }
    const bw = M.beamW * sp;
    const dir = up ? 1 : -1;
    const beamPoly = (x1: number, x2: number, level: number, cls: string | undefined) => {
      const d = level * (M.beamW + M.beamGap) * sp * dir;
      const y1 = beamY(x1) + d;
      const y2 = beamY(x2) + d;
      prims.push({ t: 'poly', points: `${x1},${y1} ${x2},${y2} ${x2},${y2 + bw * dir} ${x1},${y1 + bw * dir}`, cls });
    };
    const cls = classOf?.(first.ev.heads[0].noteId);
    beamPoly(first.stemX - (M.stemW * sp) / 2, last.stemX + (M.stemW * sp) / 2, 0, cls);
    // Secondary beams for sixteenths
    for (let i = 0; i < group.length; i++) {
      const p = group[i];
      if (p.ev.len16 !== 1) continue;
      const prev = group[i - 1];
      const next = group[i + 1];
      if (next && next.ev.len16 === 1) {
        beamPoly(p.stemX, next.stemX, 1, cls);
      } else if (!(prev && prev.ev.len16 === 1)) {
        const hook = 1.1 * sp;
        if (prev) beamPoly(p.stemX - hook, p.stemX, 1, cls);
        else if (next) beamPoly(p.stemX, p.stemX + hook, 1, cls);
      }
    }
  }

  // Heads, stems, flags, dots, accidentals, ledger lines, articulations
  for (const p of placed) {
    const ev = p.ev;
    const cls = classOf?.(ev.heads[0].noteId);
    const headCh = ev.len16 === 16 ? G.noteheadWhole : ev.len16 >= 8 ? G.noteheadHalf : G.noteheadBlack;
    const dotted = ev.len16 === 3 || ev.len16 === 6 || ev.len16 === 12;
    for (const h of ev.heads) {
      const hy = y(h.pos);
      const hcls = classOf?.(h.noteId) ?? cls;
      glyph(p.x, hy, h.x ? G.noteheadX : headCh, hcls, h.noteId);
      if (h.noteId && !heads.has(h.noteId)) heads.set(h.noteId, { x: p.x + p.headW / 2, y: hy });
      if (h.acc !== undefined) {
        const a = accidentalGlyph(h.acc);
        glyph(p.x - (a.w + 0.22) * sp, hy, a.ch, hcls);
      }
      if (dotted) glyph(p.x + p.headW + 0.3 * sp, h.pos % 2 === 0 ? hy - sp / 2 : hy, G.dot, hcls);
      // Ledger lines
      if (!geo.singleLine) {
        const lx1 = p.x - M.legerExt * sp;
        const lx2 = p.x + p.headW + M.legerExt * sp;
        for (let lp = -2; lp >= h.pos; lp -= 2) prims.push({ t: 'line', x1: lx1, y1: y(lp), x2: lx2, y2: y(lp), w: M.legerW * sp, cls: 'staff' });
        for (let lp = 10; lp <= h.pos; lp += 2) prims.push({ t: 'line', x1: lx1, y1: y(lp), x2: lx2, y2: y(lp), w: M.legerW * sp, cls: 'staff' });
      }
      prims.push({ t: 'hit', x: p.x - 0.3 * sp, y: hy - 0.8 * sp, w: p.headW + 0.6 * sp, h: 1.6 * sp, id: h.noteId ?? '', tick: ev.tick });
    }
    if (ev.len16 < 16) {
      prims.push({ t: 'line', x1: p.stemX, y1: p.stemTop, x2: p.stemX, y2: p.stemBottom, w: M.stemW * sp, cls });
      if (!ev.beam && ev.len16 < 4) {
        const sixteenth = ev.len16 === 1;
        if (p.stemUp) glyph(p.stemX - (M.stemW * sp) / 2, p.stemTop, sixteenth ? G.flag16Up : G.flag8Up, cls);
        else glyph(p.stemX - (M.stemW * sp) / 2, p.stemBottom, sixteenth ? G.flag16Down : G.flag8Down, cls);
      }
    }
    const art = ev.heads.find((h) => h.art)?.art;
    if (art) {
      const topY = Math.min(y(ev.heads[ev.heads.length - 1].pos), p.stemUp ? p.stemTop : Infinity, y(8));
      if (art === 'accent') {
        glyph(p.x + p.headW / 2 - (M.accentW * sp) / 2, topY - 0.9 * sp, G.accentAbove, cls ?? 'art');
      } else {
        const below = p.stemUp;
        const hy = below ? y(ev.heads[0].pos) + 1.0 * sp : y(ev.heads[ev.heads.length - 1].pos) - 1.0 * sp;
        const adj = ev.heads[0].pos % 2 === 0 ? (below ? 0.3 * sp : -0.3 * sp) : 0;
        const w = art === 'staccato' ? M.staccatoW : M.tenutoW;
        const ch = art === 'staccato' ? (below ? G.staccatoBelow : G.staccatoAbove) : below ? G.tenutoBelow : G.tenutoAbove;
        glyph(p.x + p.headW / 2 - (w * sp) / 2, hy + adj, ch, cls ?? 'art');
      }
    }
  }

  // Ties
  const flat = placed;
  for (let i = 0; i < flat.length; i++) {
    const p = flat[i];
    for (const h of p.ev.heads) {
      if (!h.tieToNext) continue;
      const q = flat.slice(i + 1).find((n) => n.ev.heads.some((hh) => hh.noteId === h.noteId && hh.tieFromPrev));
      const x1 = p.x + p.headW + 0.15 * sp;
      const x2 = q ? q.x - 0.15 * sp : Math.min(geo.right, x1 + 2 * sp);
      const hy = y(h.pos);
      const below = p.stemUp;
      prims.push({ t: 'path', d: curve(x1, hy + (below ? 0.5 : -0.5) * sp, x2, hy + (below ? 0.5 : -0.5) * sp, (below ? 1 : -1) * Math.min(1.2, 0.35 + (x2 - x1) / (20 * sp)) * sp, sp), cls: classOf?.(h.noteId) ?? 'tie' });
    }
  }

  // Slurs
  for (let i = 0; i < flat.length; i++) {
    const p = flat[i];
    const start = p.ev.heads.find((h) => h.slur === 'start');
    if (!start) continue;
    let j = i + 1;
    while (j < flat.length && !flat[j].ev.heads.some((h) => h.slur === 'end')) j++;
    const q = flat[Math.min(j, flat.length - 1)];
    if (!q || q === p) continue;
    const span = flat.slice(i, j + 1);
    const above = !p.stemUp || span.some((s) => !s.stemUp);
    const x1 = p.x + p.headW / 2;
    const x2 = q.x + q.headW / 2;
    const extreme = above
      ? Math.min(...span.map((s) => (s.stemUp ? s.stemTop : y(s.ev.heads[s.ev.heads.length - 1].pos))))
      : Math.max(...span.map((s) => (s.stemUp ? y(s.ev.heads[0].pos) : s.stemBottom)));
    const y1 = above ? (p.stemUp ? p.stemTop - 0.6 * sp : y(p.ev.heads[p.ev.heads.length - 1].pos) - 1.0 * sp) : y(p.ev.heads[0].pos) + 1.0 * sp;
    const y2 = above ? (q.stemUp ? q.stemTop - 0.6 * sp : y(q.ev.heads[q.ev.heads.length - 1].pos) - 1.0 * sp) : y(q.ev.heads[0].pos) + 1.0 * sp;
    const bulge = above ? Math.min(y1, y2, extreme - 0.8 * sp) - Math.min(y1, y2) - 1.0 * sp : Math.max(y1, y2, extreme + 0.8 * sp) - Math.max(y1, y2) + 1.0 * sp;
    prims.push({ t: 'path', d: curve(x1, y1, x2, y2, bulge, sp), cls: classOf?.(start.noteId) ?? 'slur' });
  }

  return { prims, barX, heads, preludeWidth: preludeW, top, sp };
}

/** A filled crescent between two points (ties and slurs). */
function curve(x1: number, y1: number, x2: number, y2: number, bulge: number, sp: number): string {
  const dx = x2 - x1;
  const c1x = x1 + dx * 0.25;
  const c2x = x1 + dx * 0.75;
  const c1y = y1 + bulge;
  const c2y = y2 + bulge;
  const th = 0.16 * sp * Math.sign(bulge || 1);
  return `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2} C${c2x},${c2y - th} ${c1x},${c1y - th} ${x1},${y1} Z`;
}
