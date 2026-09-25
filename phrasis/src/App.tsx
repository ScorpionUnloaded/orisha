import { useEffect } from 'react';
import { ModulationStrip, PhraseStrip } from './components/BottomStrips';
import { ComposerInspector } from './components/inspector/ComposerInspector';
import { MotifLibrarySidebar, StudioSidebar, SyntaxSidebar } from './components/Sidebars';
import { TitleBar } from './components/TitleBar';
import { Modals, Toasts } from './components/Overlays';
import { ComposerView } from './views/ComposerView';
import { HomeView, HomeInspector } from './views/HomeView';
import { MotifEditorView, MotifInspector } from './views/MotifEditorView';
import { PeriodBuilderView, PeriodInspector } from './views/PeriodBuilderView';
import { RhythmInspector, RhythmLabView } from './views/RhythmLabView';
import { useShortcuts } from './shortcuts';
import { setView, useApp } from './store/store';
import type { View } from './store/store';

export function App() {
  const view = useApp((s) => s.view);
  useShortcuts();
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace('#', '') as View;
      if (['home', 'composer', 'rhythm', 'motif', 'period'].includes(h)) setView(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const layout = view === 'home' ? 'no-strips' : view === 'rhythm' || view === 'period' ? 'tall-inspector' : '';
  return (
    <div className="app">
      <TitleBar />
      <main className={`window ${layout}`} data-view={view}>
        {view === 'home' ? <StudioSidebar /> : view === 'motif' ? <MotifLibrarySidebar /> : <SyntaxSidebar />}
        {view === 'home' && <HomeView />}
        {view === 'composer' && <ComposerView />}
        {view === 'rhythm' && <RhythmLabView />}
        {view === 'motif' && <MotifEditorView />}
        {view === 'period' && <PeriodBuilderView />}
        <aside className="inspector" aria-label="Inspector">
          {view === 'home' && <HomeInspector />}
          {view === 'composer' && <ComposerInspector />}
          {view === 'rhythm' && <RhythmInspector />}
          {view === 'motif' && <MotifInspector />}
          {view === 'period' && <PeriodInspector />}
        </aside>
        {view !== 'home' && <ModulationStrip />}
        {view !== 'home' && <PhraseStrip />}
      </main>
      <Toasts />
      <Modals />
    </div>
  );
}
