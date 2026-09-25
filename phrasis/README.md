# PHRASIS — Melodic Syntax Laboratory

PHRASIS is a workstation for **melodic syntax**: a notation editor and piano roll that also know
*what every note belongs to*: which drawing (*dessin*) it builds, which member (*membre*) it
closes, where the phrase breathes, and how strongly each rest point closes.

A sequencer answers *which note, when, how long, how loud*. PHRASIS adds a second layer:
*which motif is this, which drawing does it build, where is the cadence, what is the relation
between this member and the previous one, where is the symmetry of the period?*

```
MELODY
└── PERIOD 01                       A1 A2 , A1' A3 ; B1 B2 .
    ├── MEMBER A   ── A1 (α) · A2 (α)        ¼ cadence  ,
    ├── MEMBER A'  ── A1' (α → Gm) · A3 (β)  ½ cadence  ;
    └── MEMBER B   ── B1 (γ) · B2 (γ)        full cadence .
```

## Screens

| Screen | How to get there | What it does |
| --- | --- | --- |
| **Studio home** | `PHRASIS` title, `⌘1` | Templates, recent projects with engraved previews, project inspector (metadata, keywords, notes), import/export. |
| **Composer** | double-click a project, a drawing in the tree, a unit in the phrase strip, `⌘2` | Melodic staff, rhythmic staff and piano roll: three projections of the same graph on one time axis. Show *Pitches*, *Contour* (drag turning points to reshape a drawing without breaking its internal relations) or *Syntax* (drawings coloured, motif symbols, punctuation, local scale degrees). |
| **Rhythm Lab** | rhythmic staff `…` menu or double-click, `⌘3` | Rhythm without pitch: a lane-based rhythmic staff, onset pattern with pulse grouping, a density fingerprint, and an editable four-lane step grid. The inspector is a pipeline: extract rhythm → apply rhythm (replace durations / onsets / accents) → quantize → swing. |
| **Motif Drawing Editor** | click a motif, *Library*, `⌘4` | Draw motifs with pencil / eraser / marquee / move tools, scale quantize, and preview nine transformations (transpose, invert, retrograde, augment, diminish, rhythmic, contour-only, sequence). Transformations stay non-destructive until **Commit** or **Save as new motif**. 24-motif library with categories, smart groups, collections and favourites. |
| **Period Builder** | *Period Builder* in the syntax tree, `⌘5` | Drag blocks to reorder the period, drag timeline edges to change unit lengths, click rest points to change cadences, and see similarity/transformation/contrast arcs, a bar-aligned notation preview and a structural (harmonic) outline. |

Always visible below the editors: the **Modulation** map (click a region to re-key it) and the
**Phrase** strip, where the whole melody reads as punctuated text (`A1 A2 , A1' A3 ; B1 B2 .`).
Click a punctuation mark to change that cadence.

## What you can do

- **Edit once, see it everywhere.** Dragging a note in the piano roll moves it on both staves;
  selecting a drawing highlights it in every view and in the phrase strip.
- **Work in scale degrees.** `↑`/`↓` move by degree, the Scale menu re-expresses a drawing in
  another mode degree-for-degree, and the key menu re-keys the whole period.
- **Transform drawings.** `M` mirror (inversion), `R` reverse (retrograde), `[`/`]` compress or
  stretch intervals, `⌥`-drag duplicates notes as a variation, and the inspector's *Transform*
  regenerates a drawing from its motif.
- **Generate variations deterministically.** *Apply Transformation…* opens the experiment engine:
  choose what to preserve (cadence, measure count, rhythm, scale), what to vary (contour,
  intervals) and a distance from the source. Each proposal lists the exact recipe that produced it.
- **Treat cadences as objects.** Each drawing ends in a rest point: open, ¼, ½, strong or full.
  Members are closed by their cadence. The member inspector shows a closure meter and how the
  member compares with the previous one.
- **Play it.** Web Audio playback with loop (selected drawing), a level meter and master volume.
  `●` turns on step input: `A W S E D F T G Y H U J K` enter notes at the playhead.
- **Keep your work.** Projects and the motif library are saved in the browser (`localStorage`),
  with full undo/redo. Export any project as MIDI or `.phrasis.json`, and import JSON back.

Press `?` for the full shortcut list.

## Architecture

```
src/
  model/        the Musical Syntax Graph and pure music logic (no React)
    types.ts        Note, Drawing, Project, Motif… (every note is owned by one drawing)
    theory.ts       modes, key signatures, pitch spelling, scale degrees
    syntax.ts       placement of drawings, derived members, cadence points, phrase tokens
    transforms.ts   transpose, invert, retrograde, augment/diminish, sequence, contour,
                    quantize, swing, extract/apply rhythm, melody → step pattern
    analysis.ts     contour/symmetry/rhythm classification, similarity, density, outline
    variations.ts   named variations and the deterministic variation generator
    demo.ts         the demo period, the 24-motif library, recent projects, templates
    midi.ts         Standard MIDI File writer
  notation/     SVG engraving with the Bravura SMuFL font
    layout.ts       quantised bars, beams, ties, slurs, accidentals, rests, articulations,
                    and three spacing modes (shared time axis, compact, bar-aligned)
  store/        zustand store: selection, editing actions, undo/redo, persistence, transport
  audio/        Web Audio voice and look-ahead scheduler
  components/   title bar, sidebars, inspectors, piano roll, timeline overlays, strips, modals
  views/        Home, Composer, Rhythm Lab, Motif Editor, Period Builder
```

Members are *derived*: a member is a run of consecutive drawings that share a member key, closed
by the cadence of its last drawing. Reordering blocks in the Period Builder or changing a
cadence therefore re-derives the grammar instead of editing three copies of the music.

## Develop

```bash
cd phrasis
npm install
npm run dev        # http://localhost:5173 — append #composer, #rhythm, #motif or #period
npm test           # model, notation and feature tests (vitest)
npm run typecheck
npm run build      # static bundle in dist/ (relative paths, can be opened from any folder)
```

## Notes on the design mockups

The five reference mockups disagree on a few numbers, for example the length of drawing A2 and
the cadence at bar 4, so PHRASIS uses one coherent demo period that matches as many screens as
possible: 16 bars in C minor at 112 BPM, units A1 (4) A2 (4) A1′ (2) A3 (2) B1 (2) B2 (2), rest
points after A2 (¼), A3 (½) and B2 (full), modulating Cm → Gm → E♭ → Cm. Every value the
inspectors show is computed from that data rather than typed in.

## Credits

- [Bravura](https://github.com/steinbergmedia/bravura) music font by Steinberg, SIL Open Font License 1.1.
- [Inter](https://rsms.me/inter/) by Rasmus Andersson, SIL Open Font License 1.1.
