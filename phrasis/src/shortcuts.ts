import { useEffect } from 'react';
import {
  applyDrawingTransform,
  deleteNotes,
  moveNotes,
  redo,
  scrollBy,
  selectedDrawing,
  setArticulation,
  setUi,
  setView,
  setZoom,
  stepInput,
  stretchPitch,
  togglePlay,
  transposeSelection,
  undo,
  useApp,
} from './store/store';
import type { View } from './store/store';

const STEP_KEYS: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14 };
const VIEWS: View[] = ['home', 'composer', 'rhythm', 'motif', 'period'];

function editableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
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
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        setView(VIEWS[Number(e.key) - 1]);
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        setZoom(1);
        return;
      }
      if (mod && key === '-') {
        e.preventDefault();
        setZoom(-1);
        return;
      }
      if (mod) return;
      if (e.key === ' ') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') (e.target as HTMLElement).blur();
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === '?') {
        setUi({ modal: { kind: 'shortcuts' } });
        return;
      }
      if (s.view === 'home' || s.view === 'motif') return;
      if (s.recording && key in STEP_KEYS && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        stepInput(STEP_KEYS[key]);
        return;
      }
      const drawing = selectedDrawing(s);
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (s.noteSel.length) {
          e.preventDefault();
          deleteNotes(s.noteSel);
        }
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        if (e.altKey && drawing) stretchPitch(drawing.id, dir > 0 ? 1.5 : 0.67);
        else transposeSelection(dir, e.shiftKey);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (s.noteSel.length && !e.shiftKey) moveNotes(s.noteSel, dir * s.snap, 0);
        else scrollBy(dir);
        return;
      }
      if (!drawing) return;
      if (key === 'm') applyDrawingTransform(drawing.id, 'invert');
      else if (key === 'r') applyDrawingTransform(drawing.id, 'retrograde');
      else if (e.key === '>') s.noteSel.length && setArticulation(s.noteSel, 'accent');
      else if (e.key === '.') s.noteSel.length && setArticulation(s.noteSel, 'staccato');
      else if (e.key === ']') stretchPitch(drawing.id, 1.5);
      else if (e.key === '[') stretchPitch(drawing.id, 0.67);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['⌘1 … ⌘5', 'Home · Composer · Rhythm Lab · Motif Editor · Period Builder'],
  ['⌘+ / ⌘−', 'Zoom the time axis'],
  ['↑ ↓', 'Move selection by a scale degree (⇧ = octave)'],
  ['⌥↑ ⌥↓', 'Stretch / compress the intervals of the drawing'],
  ['← →', 'Nudge selected notes (⇧ = scroll the view)'],
  ['⌫', 'Delete selected notes'],
  ['M', 'Mirror (inversion) of the selected drawing'],
  ['R', 'Reverse (retrograde) of the selected drawing'],
  ['[ ]', 'Compress / stretch pitch intervals'],
  ['> .', 'Accent / staccato on selected notes'],
  ['● then A W S E D F T G Y H U J K', 'Step input at the playhead'],
  ['⌥-drag', 'Duplicate notes as a variation (piano roll)'],
  ['Double-click', 'Add a note (piano roll)'],
];
