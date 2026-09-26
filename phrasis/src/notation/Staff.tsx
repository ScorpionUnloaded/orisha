import { useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Meter, Note } from '../model/types';
import { barwiseMapping, buildBars, compactMapping, engrave, preludeWidth } from './layout';
import type { Clef, EngraveOptions, Engraved, Prim, StaffGeometry, XMap } from './layout';

export interface StaffProps {
  notes: Note[];
  opts: EngraveOptions;
  geo: StaffGeometry;
  /** Proportional mapping shared with other views; compact spacing when omitted. */
  xOf?: XMap;
  classOf?: (noteId: string | undefined) => string | undefined;
  onNoteDown?: (noteId: string, e: ReactPointerEvent) => void;
  onEngraved?: (e: Engraved) => void;
  /** With `xOf`: 'axis' places notes exactly on the axis, 'barwise' only aligns barlines. */
  spacing?: 'axis' | 'barwise';
  children?: (e: Engraved) => ReactNode;
}

export function renderPrims(prims: Prim[], sp: number, onNoteDown?: StaffProps['onNoteDown']) {
  const fs = sp * 4;
  return prims.map((p, i) => {
    switch (p.t) {
      case 'glyph':
        return (
          <text key={i} x={p.x} y={p.y} fontSize={fs} className={`smufl ${p.cls ?? ''}`}>
            {p.ch}
          </text>
        );
      case 'line':
        return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} strokeWidth={p.w} className={`ln ${p.cls ?? ''}`} />;
      case 'poly':
        return <polygon key={i} points={p.points} className={`fill ${p.cls ?? ''}`} />;
      case 'path':
        return <path key={i} d={p.d} className={`fill ${p.cls ?? ''}`} />;
      case 'hit':
        return onNoteDown && p.id ? (
          <rect
            key={i}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            className="hit"
            onPointerDown={(e) => {
              e.stopPropagation();
              onNoteDown(p.id, e);
            }}
          />
        ) : null;
    }
  });
}

/** Engraved staff plus the tick → x mapping it was laid out with (for overlays and hit-testing). */
export function useEngraving(
  notes: Note[],
  opts: EngraveOptions,
  geo: StaffGeometry,
  xOf: XMap | undefined,
  classOf?: StaffProps['classOf'],
  spacing: 'axis' | 'barwise' = 'axis',
): Engraved & { map: XMap } {
  return useMemo(() => {
    const bars = buildBars(notes, opts);
    const pre = geo.showClef === false && geo.showKey === false && geo.showTime === false ? 0 : preludeWidth(opts.clef, opts.fifths, geo.sp, geo.showKey !== false, geo.showTime !== false);
    const map = xOf
      ? spacing === 'barwise'
        ? barwiseMapping(bars, xOf, geo.sp)
        : xOf
      : compactMapping(bars, geo.preludeX + pre + geo.sp * 0.4, geo.right - (geo.preludeX + pre + geo.sp * 0.4), geo.sp);
    return { ...engrave(bars, opts, geo, map, classOf), map };
  }, [notes, opts, geo, xOf, classOf, spacing]);
}

export function Staff({ notes, opts, geo, xOf, classOf, onNoteDown, spacing, children }: StaffProps) {
  const engraved = useEngraving(notes, opts, geo, xOf, classOf, spacing);
  return (
    <g className="staff-g">
      {renderPrims(engraved.prims, geo.sp, onNoteDown)}
      {children?.(engraved)}
    </g>
  );
}

export interface MiniStaffProps {
  notes: Note[];
  lower?: Note[];
  clef?: Clef;
  fifths: number;
  meter: Meter;
  from: number;
  to: number;
  width: number;
  height: number;
  sp?: number;
  showTime?: boolean;
  showKey?: boolean;
  percussion?: boolean;
  className?: string;
  finalBar?: boolean;
}

const PERC = () => ({ positions: [4] });

/** Self-contained compact staff used for previews. */
export function MiniStaff(props: MiniStaffProps) {
  const sp = props.sp ?? 5;
  const clef: Clef = props.percussion ? 'percussion' : props.clef ?? 'treble';
  const twoStaves = !!props.lower && !props.percussion;
  const staffH = sp * 4;
  const gap = twoStaves ? sp * 4.5 : 0;
  const top1 = twoStaves ? (props.height - (staffH * 2 + gap)) / 2 : (props.height - staffH) / 2;
  const top2 = top1 + staffH + gap;
  const opts1 = useMemo<EngraveOptions>(
    () => ({ clef, fifths: props.percussion ? 0 : props.fifths, meter: props.meter, from: props.from, to: props.to, percussion: props.percussion ? PERC : undefined }),
    [clef, props.fifths, props.meter, props.from, props.to, props.percussion],
  );
  const opts2 = useMemo<EngraveOptions>(
    () => ({ clef: 'bass', fifths: props.fifths, meter: props.meter, from: props.from, to: props.to }),
    [props.fifths, props.meter, props.from, props.to],
  );
  const geo1 = useMemo<StaffGeometry>(
    () => ({ sp, top: top1, left: 2, right: props.width - 2, preludeX: 2, showTime: props.showTime ?? true, showKey: props.showKey ?? true, finalBar: props.finalBar }),
    [sp, top1, props.width, props.showTime, props.showKey, props.finalBar],
  );
  const geo2 = useMemo<StaffGeometry>(
    () => ({ sp, top: top2, left: 2, right: props.width - 2, preludeX: 2, showTime: props.showTime ?? true, showKey: props.showKey ?? true, finalBar: props.finalBar }),
    [sp, top2, props.width, props.showTime, props.showKey, props.finalBar],
  );
  // Shared x-map for both staves so that the voices line up.
  const upper = useEngraving(props.notes, opts1, geo1, undefined);
  const lowerEng = useLowerEngraving(twoStaves ? props.lower! : [], opts2, geo2, twoStaves);
  return (
    <svg className={`mini-staff ${props.className ?? ''}`} width={props.width} height={props.height} viewBox={`0 0 ${props.width} ${props.height}`}>
      {renderPrims(upper.prims, sp)}
      {lowerEng && renderPrims(lowerEng.prims, sp)}
      {twoStaves && <line x1={2} y1={top1} x2={2} y2={top2 + staffH} strokeWidth={sp * 0.16} className="ln barline" />}
    </svg>
  );
}

function useLowerEngraving(notes: Note[], opts: EngraveOptions, geo: StaffGeometry, enabled: boolean) {
  return useMemo(() => {
    if (!enabled) return null;
    const bars = buildBars(notes, opts);
    const pre = preludeWidth('bass', opts.fifths, geo.sp, geo.showKey !== false, geo.showTime !== false);
    const map = compactMapping(bars, geo.preludeX + pre + geo.sp * 0.4, geo.right - (geo.preludeX + pre + geo.sp * 0.4), geo.sp);
    return engrave(bars, opts, geo, map);
  }, [notes, opts, geo, enabled]);
}
