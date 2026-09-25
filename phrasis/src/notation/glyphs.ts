/** SMuFL code points (Bravura) and metrics in staff spaces. */
export const G = {
  gClef: '',
  fClef: '',
  percClef: '',
  timeSig: (d: number) => String.fromCharCode(0xe080 + d),
  noteheadWhole: '',
  noteheadHalf: '',
  noteheadBlack: '',
  noteheadX: '',
  dot: '',
  flag8Up: '',
  flag8Down: '',
  flag16Up: '',
  flag16Down: '',
  flat: '',
  natural: '',
  sharp: '',
  doubleSharp: '',
  doubleFlat: '',
  restWhole: '',
  restHalf: '',
  restQuarter: '',
  rest8: '',
  rest16: '',
  accentAbove: '',
  staccatoAbove: '',
  staccatoBelow: '',
  tenutoAbove: '',
  tenutoBelow: '',
};

export const M = {
  headW: 1.18,
  wholeW: 1.688,
  xHeadW: 1.16,
  stemW: 0.12,
  stemAttach: 0.168,
  staffLineW: 0.13,
  legerW: 0.16,
  legerExt: 0.4,
  beamW: 0.5,
  beamGap: 0.25,
  thinBar: 0.16,
  thickBar: 0.5,
  flatW: 0.904,
  sharpW: 0.996,
  naturalW: 0.672,
  gClefW: 2.684,
  fClefW: 2.736,
  percClefW: 1.528,
  timeSigW: 1.8,
  accentW: 1.356,
  staccatoW: 0.336,
  tenutoW: 1.352,
};

export function accidentalGlyph(alter: number): { ch: string; w: number } {
  switch (alter) {
    case -2:
      return { ch: G.doubleFlat, w: 1.6 };
    case -1:
      return { ch: G.flat, w: M.flatW };
    case 1:
      return { ch: G.sharp, w: M.sharpW };
    case 2:
      return { ch: G.doubleSharp, w: 1.0 };
    default:
      return { ch: G.natural, w: M.naturalW };
  }
}
