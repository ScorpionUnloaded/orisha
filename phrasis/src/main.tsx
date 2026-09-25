import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import bravuraUrl from '@vexflow-fonts/bravura/bravura.woff2?url';
import './styles/app.css';
import { App } from './App';
import { useApp } from './store/store';

if (import.meta.env.DEV) (window as unknown as { __phrasis: typeof useApp }).__phrasis = useApp;

async function boot() {
  try {
    const face = new FontFace('Bravura', `url(${bravuraUrl})`);
    document.fonts.add(await face.load());
  } catch {
    /* notation falls back gracefully if the font fails */
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
