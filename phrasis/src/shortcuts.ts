import { useEffect } from 'react';
import { ROLL_TOOL_KEYS } from './components/EditTools';
import { chop, glue, legato, quantizeNotes } from './model/editing';
import { T16, T8, TPQ } from './model/types';
import {
  applyDrawingTransform,
  chooseDuration,
  copyNotes,
  deleteNotes,
  deselectNotes,
  duplicateNotes,
  glueNotes,
  inputBackspace,
  inputInterval,
  inputLetter,
  inputRepeat,
  inputRest,
  inputTie,
  invertNoteSelection,
  moveCaret,
  moveNotes,
  pasteNotes,
  redo,
  resizeNotes,
  runTool,
  scrollBy,
  selectAdjacent,
  selectAllNotes,
  selectedDrawing,
  setArticulation,
  setTimeSel,
  setUi,
  setView,
  setZoom,
  stepInput,
  stopNoteInput,
  stretchPitch,
  targetIds,
  toggleDot,
  toggleNoteInput,
  togglePlay,
  toggleSlurNotes,
  transposeNotes,
  transposeSelection,
  undo,
  useApp,
} from './store/store';
import type { View } from './store/store';

const STEP_KEYS: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14 };
const VIEWS: View[] = ['home', 'composer', 'rhythm', 'motif', 'period'];
/** Letter names → letter index (C = 0). */
const LETTERS: Record<string, number> = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
/** Note values on 3–7, as on a notation keypad (3 = sixteenth … 7 = whole). */
const DURATION_KEYS: Record<string, number> = { '3': T16, '4': T8, '5': TPQ, '6': TPQ * 2, '7': TPQ * 4 };

function editableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editableTarget(e.target)) return;
      const s = useApp.getState();
      if (s.modal) {
        if (e.key === 'Escape') setUi({ modal: null });
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.getAttribute?.('aria-haspopup') && ['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return;
      if (target?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) {
        target.blur();
        e.preventDefault();
      }
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const editing = s.view === 'composer' || s.view === 'rhythm' || s.view === 'period';
      const pane = s.view === 'composer' ? s.focusPane : 'legacy';
      const sel = s.noteSel;
      const handled = () => e.preventDefault();

      // ---------------------------------------------------------------- with ⌘ / Ctrl
      if (mod && key === 'z') {
        handled();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        handled();
        redo();
        return;
      }
      if (mod && /^[1-5]$/.test(e.key)) {
        handled();
        setView(VIEWS[Number(e.key) - 1]);
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        handled();
        setZoom(1);
        return;
      }
      if (mod && key === '-') {
        handled();
        setZoom(-1);
        return;
      }
      if (mod && editing) {
        if (key === 'a') {
          handled();
          selectAllNotes();
        } else if (key === 'c') {
          handled();
          copyNotes();
        } else if (key === 'x') {
          handled();
          copyNotes(true);
        } else if (key === 'v') {
          handled();
          pasteNotes();
        } else if (key === 'b') {
          handled();
          duplicateNotes();
        } else if (key === 'd') {
          handled();
          deselectNotes();
        } else if (key === 'i' && e.shiftKey) {
          handled();
          invertNoteSelection();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          handled();
          transposeNotes(targetIds(s), e.key === 'ArrowUp' ? 12 : -12, 'chromatic');
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          handled();
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          if (s.noteInput) moveCaret(dir, true);
          else if (pane === 'staff') selectAdjacent(dir, e.shiftKey, true);
          else if (sel.length) resizeNotes(sel, dir * Math.max(T16 / 2, s.snap));
        }
        return;
      }
      if (mod) return;

      // ---------------------------------------------------------------- plain keys
      if (e.key === ' ') {
        handled();
        togglePlay();
        return;
      }
      if (e.key === '?') {
        setUi({ modal: { kind: 'shortcuts' } });
        return;
      }
      if (!editing) return;
      if (s.recording && key in STEP_KEYS && !e.shiftKey && !e.altKey) {
        handled();
        stepInput(STEP_KEYS[key]);
        return;
      }

      // Note input (N): letters are pitches at the caret.
      if (s.noteInput && s.view === 'composer') {
        if (e.key === 'Escape' || key === 'n') {
          handled();
          stopNoteInput();
          return;
        }
        if (key in LETTERS && !e.altKey) {
          handled();
          inputLetter(LETTERS[key], e.shiftKey);
          return;
        }
        if (e.altKey && /^Digit[2-8]$/.test(e.code)) {
          handled();
          inputInterval(Number(e.code.slice(5)));
          return;
        }
        if (e.key in DURATION_KEYS) {
          handled();
          chooseDuration(DURATION_KEYS[e.key], false);
          return;
        }
        if (e.key === '.' || e.code === 'NumpadDecimal') {
          handled();
          toggleDot(false);
          return;
        }
        if (e.key === '0') {
          handled();
          inputRest();
          return;
        }
        if (e.key === 'Enter') {
          handled();
          inputTie();
          return;
        }
        if (e.key === 'Backspace') {
          handled();
          inputBackspace();
          return;
        }
        if (key === 'r') {
          handled();
          inputRepeat();
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          handled();
          moveCaret(e.key === 'ArrowRight' ? 1 : -1);
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          handled();
          const dir = e.key === 'ArrowUp' ? 1 : -1;
          transposeNotes(sel, e.shiftKey ? dir * 12 : dir, e.shiftKey ? 'chromatic' : 'diatonic');
          return;
        }
      }

      const drawing = selectedDrawing(s);
      if (e.key === 'Escape') {
        if (sel.length || s.timeSel) {
          deselectNotes();
          setTimeSel(null);
        }
        return;
      }
      if (key === 'n' && s.view === 'composer') {
        handled();
        toggleNoteInput();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (sel.length) {
          handled();
          deleteNotes(sel);
        }
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        handled();
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        if (e.altKey && drawing) stretchPitch(drawing.id, dir > 0 ? 1.5 : 0.67);
        else if (e.shiftKey) transposeNotes(targetIds(s), dir * 12, 'chromatic');
        else if (pane === 'roll' && !s.scaleQuantize) transposeNotes(targetIds(s), dir, 'chromatic');
        else transposeSelection(dir);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        handled();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (pane === 'staff' && !e.altKey) selectAdjacent(dir, e.shiftKey);
        else if (sel.length && !e.shiftKey) moveNotes(sel, dir * (e.altKey ? 10 : Math.max(1, s.snap)), 0);
        else scrollBy(dir);
        return;
      }
      if (e.key === '=' || e.key === '+') {
        handled();
        transposeNotes(sel, 1, 'chromatic');
        return;
      }
      if (e.key === '-') {
        handled();
        transposeNotes(sel, -1, 'chromatic');
        return;
      }
      if (e.key in DURATION_KEYS) {
        handled();
        chooseDuration(DURATION_KEYS[e.key], pane === 'staff');
        return;
      }
      if (e.key === '0' && pane === 'staff' && sel.length) {
        handled();
        deleteNotes(sel);
        return;
      }
      if (e.key === 'Enter') {
        if (sel.length > 1) {
          handled();
          glueNotes();
        }
        return;
      }
      if (e.key === '>') return void (sel.length && setArticulation(sel, 'accent'));
      if (e.key === '.') return void (sel.length && setArticulation(sel, 'staccato'));
      if (e.key === '_') return void (sel.length && setArticulation(sel, 'tenuto'));
      if (e.altKey) return;
      if (s.view === 'composer' && key in ROLL_TOOL_KEYS && !e.shiftKey) {
        setUi({ rollTool: ROLL_TOOL_KEYS[key], focusPane: 'roll' });
        return;
      }
      const grid = Math.max(T16 / 2, s.snap);
      if (key === 'q') runTool((n, ids) => quantizeNotes(n, ids, grid, { ends: !e.shiftKey }), e.shiftKey ? 'Start times quantized' : 'Quantized');
      else if (key === 'l') runTool(legato, 'Legato');
      else if (key === 'g') runTool(glue, 'Glued');
      else if (key === 'u') runTool((n, ids) => chop(n, ids, grid), 'Chopped');
      else if (key === 's') toggleSlurNotes();
      else if (!drawing) return;
      else if (key === 'm') applyDrawingTransform(drawing.id, 'invert');
      else if (key === 'r') applyDrawingTransform(drawing.id, 'retrograde');
      else if (e.key === ']') stretchPitch(drawing.id, 1.5);
      else if (e.key === '[') stretchPitch(drawing.id, 0.67);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export const SHORTCUT_SECTIONS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'General',
    items: [
      ['Space', 'Play / pause'],
      ['⌘Z / ⇧⌘Z', 'Undo / redo'],
      ['⌘1 … ⌘5', 'Home · Composer · Rhythm Lab · Motif Editor · Period Builder'],
      ['⌘+ / ⌘−', 'Zoom the time axis (⌘-wheel in the piano roll)'],
      ['Click a panel', 'Gives the staves or the piano roll the arrow keys'],
    ],
  },
  {
    title: 'Selection & clipboard',
    items: [
      ['⌘A · Esc / ⌘D', 'Select all · deselect'],
      ['⌘C ⌘X ⌘V', 'Copy · cut · paste at the playhead / time selection'],
      ['⌘B', 'Duplicate the selection after itself'],
      ['⇧⌘I', 'Invert the selection'],
      ['⌫', 'Delete selected notes'],
      ['Drag in a ruler', 'Time selection (selects notes, sets the loop)'],
    ],
  },
  {
    title: 'Staves (Sibelius-style)',
    items: [
      ['Click · ⇧-click · ⌘-click', 'Select a note · a range · add/remove'],
      ['Click a bar', 'Select the bar (⇧ extends)'],
      ['← →', 'Previous / next note (⇧ extends, ⌘ by bar)'],
      ['↑ ↓', 'Move by a scale degree (⇧ / ⌘ = octave)'],
      ['= / −', 'Up / down a semitone (sharp / flat)'],
      ['3 4 5 6 7', 'Sixteenth · eighth · quarter · half · whole (sets selected notes)'],
      ['0 · Enter', 'Turn into rests · tie repeated notes'],
      ['> . _ S', 'Accent · staccato · tenuto · slur'],
      ['Drag a notehead', 'Change its pitch by staff positions'],
      ['⌥-click', 'Paste at the click'],
      ['Double-click a note', 'Note properties'],
    ],
  },
  {
    title: 'Note input (N)',
    items: [
      ['N / Esc', 'Start / stop note input at the caret'],
      ['A–G', 'Enter a note in the key (⇧ adds it above as a chord)'],
      ['⌥2 … ⌥8', 'Add an interval above (second … octave)'],
      ['3–7 · .', 'Note value · dot'],
      ['0 · Enter · R', 'Rest · tie · repeat the last note'],
      ['⌫ · ← →', 'Delete the last note · move the caret'],
      ['Click the staff', 'Enter the note under the pointer'],
    ],
  },
  {
    title: 'Piano roll (FL Studio-style)',
    items: [
      ['P B E C D T Y', 'Draw · Paint · Select · Slice · Delete · Mute · Playback tools'],
      ['Right-click / drag', 'Delete notes (on empty grid: context menu)'],
      ['⇧-drag · ⌥-drag', 'Duplicate while moving · move without snap'],
      ['Drag note edges', 'Resize from the end or the start'],
      ['⌘-drag (Draw)', 'Box selection'],
      ['↑ ↓ · ⇧↑ ↓', 'Semitone (scale degree with In key) · octave'],
      ['← → · ⌥ · ⌘', 'Nudge by snap · fine nudge · shorten / lengthen'],
      ['Q ⇧Q L G U', 'Quantize · starts only · legato · glue · chop'],
      ['Wheel · ⌥ · ⇧ · ⌘', 'Scroll pitch · zoom keys · scroll time · zoom time'],
      ['⌘-click a key', 'Select every note of that pitch'],
      ['Velocity lane', 'Drag stems · sweep to paint · ⇧-drag for a ramp'],
    ],
  },
  {
    title: 'Drawings',
    items: [
      ['M · R', 'Mirror (inversion) · reverse (retrograde) the drawing'],
      ['[ ] · ⌥↑ ⌥↓', 'Compress / stretch the drawing’s intervals'],
      ['● then A W S E D F T G…', 'Step input at the playhead from the computer keyboard'],
    ],
  },
];
