import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { keyLabel, keyOptions, MODE_ORDER, MODES, tonicNameAscii } from '../model/theory';
import type { Meter, ScaleRef } from '../model/types';
import {
  rewind,
  setKey,
  setMeter,
  setTempo,
  setView,
  setVolume,
  setZoom,
  stopAndReset,
  toggleLoop,
  togglePlay,
  toggleRecord,
  useApp,
  useProject,
} from '../store/store';
import { Select } from './ui/Controls';
import { Loop, Minus, PauseIcon, PlayIcon, Plus, Rewind, StopIcon } from './ui/Icons';

const METERS: Meter[] = [
  { num: 2, den: 4 },
  { num: 3, den: 4 },
  { num: 4, den: 4 },
  { num: 5, den: 4 },
  { num: 6, den: 8 },
  { num: 7, den: 8 },
  { num: 9, den: 8 },
  { num: 12, den: 8 },
];

const TEMPI = [60, 66, 72, 80, 84, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 144, 160, 176];

function LevelMeter() {
  const playing = useApp((s) => s.playing);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!playing) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const loop = () => {
      setLevel((l) => Math.max(engine.level(), l * 0.86));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const heights = [6, 9, 12, 16];
  return (
    <div className="meter-icon" title="Output level" aria-hidden>
      {heights.map((h, i) => (
        <span key={i} style={{ height: h }} className={level > i * 0.22 + 0.04 ? 'lit' : ''} />
      ))}
    </div>
  );
}

function Volume() {
  const volume = useApp((s) => s.volume);
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const update = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setVolume(Math.max(0, Math.min(1, (clientX - r.left - 4) / (r.width - 12))));
  };
  return (
    <div
      ref={ref}
      className="vol"
      role="slider"
      tabIndex={0}
      aria-label="Master volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(volume * 100)}
      title={`Volume ${Math.round(volume * 100)}%`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        update(e.clientX);
      }}
      onPointerMove={(e) => drag && update(e.clientX)}
      onPointerUp={() => setDrag(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setVolume(Math.min(1, volume + 0.05));
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setVolume(Math.max(0, volume - 0.05));
      }}
    >
      <span style={{ left: `${4 + volume * 24}px` }} />
    </div>
  );
}

export function TitleBar() {
  const project = useProject();
  const playing = useApp((s) => s.playing);
  const loop = useApp((s) => s.loop);
  const recording = useApp((s) => s.recording);
  const zoom = useApp((s) => s.zoom);

  const keys = keyOptions();
  const modal = MODE_ORDER.filter((m) => m !== 'aeolian' && m !== 'major').map<ScaleRef>((mode) => ({ tonic: project.key.tonic, mode }));
  const keyOpts = [
    ...keys.map((k) => ({ value: k, label: keyLabel(k) })),
    'sep' as const,
    ...modal.map((k) => ({ value: k, label: `${tonicNameAscii(k)} ${MODES[k.mode].keyName}` })),
  ];

  return (
    <header className="titlebar">
      <div className="traffic" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <button type="button" className="brand" onClick={() => setView('home')} title="Studio home">
        <span className="brand-name">PHRASIS</span>
        <span className="brand-sub">Melodic Syntax Laboratory</span>
      </button>
      <div className="tb-group">
        <Select titlebar value={project.key} options={keyOpts} onChange={setKey} style={{ width: 118 }} ariaLabel="Key" />
        <Select
          titlebar
          value={project.meter}
          options={METERS.map((m) => ({ value: m, label: `${m.num}/${m.den}` }))}
          onChange={setMeter}
          style={{ width: 86 }}
          ariaLabel="Meter"
        />
        <div
          onWheel={(e) => {
            setTempo(project.tempo + (e.deltaY < 0 ? 1 : -1));
          }}
        >
          <Select
            titlebar
            value={project.tempo}
            options={(TEMPI.includes(project.tempo) ? TEMPI : [...TEMPI, project.tempo].sort((a, b) => a - b)).map((t) => ({ value: t, label: `${t}  BPM` }))}
            onChange={setTempo}
            display={<span style={{ whiteSpace: 'pre' }}>{`${project.tempo}  BPM`}</span>}
            style={{ width: 118 }}
            ariaLabel="Tempo"
          />
        </div>
      </div>
      <div className="tb-group" style={{ marginLeft: 8, flex: 'none' }}>
        <button type="button" className={`tb-btn ${recording ? 'recording active' : ''}`} onClick={toggleRecord} title="Step input (record)" aria-pressed={recording}>
          <span className="record-dot" />
        </button>
        <button type="button" className="tb-btn bare" onClick={rewind} title="Return to start" style={{ marginLeft: 5 }}>
          <Rewind />
        </button>
        <button type="button" className="play-btn" onClick={togglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon size={17} color="#fff" /> : <PlayIcon size={17} color="#fff" style={{ marginLeft: 2 }} />}
        </button>
        <button type="button" className="tb-btn bare" onClick={stopAndReset} title="Stop">
          <StopIcon size={17} />
        </button>
        <button type="button" className={`tb-btn ${loop ? 'active' : ''}`} onClick={toggleLoop} title="Loop selection" aria-pressed={loop}>
          <Loop />
        </button>
      </div>
      <div className="zoom">
        <button type="button" onClick={() => setZoom(-1)} aria-label="Zoom out">
          <Minus />
        </button>
        <span className="zoom-val">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(1)} aria-label="Zoom in">
          <Plus size={16} />
        </button>
      </div>
      <LevelMeter />
      <Volume />
    </header>
  );
}
