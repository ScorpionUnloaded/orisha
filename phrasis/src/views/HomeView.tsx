import { useRef, useState } from 'react';
import { TEMPLATES } from '../model/demo';
import type { TemplateId } from '../model/demo';
import { download, projectToMidi, slug } from '../model/midi';
import { absoluteNotes, barTicks, totalBars } from '../model/syntax';
import { keyFifths, keyLabel } from '../model/theory';
import type { Project } from '../model/types';
import { MiniStaff } from '../notation/Staff';
import { InspectorHead } from '../components/inspector/Common';
import { EditableText, MenuButton } from '../components/ui/Controls';
import type { MenuItem } from '../components/ui/Controls';
import { Doc, Plus, TemplateIcon } from '../components/ui/Icons';
import {
  archiveProject,
  deleteProject,
  duplicateProject,
  importProject,
  openProject,
  resetDemo,
  setProjectMeta,
  setUi,
  toast,
  useApp,
} from '../store/store';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

export function formatModified(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatCreated(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function projectMenu(p: Project, archived: boolean): MenuItem[] {
  return [
    { label: 'Open', onSelect: () => openProject(p.id) },
    { label: 'Open in Period Builder', onSelect: () => openProject(p.id, 'period') },
    'sep',
    { label: 'Duplicate', onSelect: () => duplicateProject(p.id) },
    { label: 'Export MIDI', onSelect: () => download(`${slug(p.name)}.mid`, projectToMidi(p) as BlobPart, 'audio/midi') },
    { label: 'Export project (.json)', onSelect: () => download(`${slug(p.name)}.phrasis.json`, JSON.stringify(p, null, 2), 'application/json') },
    'sep',
    { label: archived ? 'Restore from Archives' : 'Move to Archives', onSelect: () => archiveProject(p.id, !archived) },
    { label: 'Delete', danger: true, onSelect: () => deleteProject(p.id) },
  ];
}

function Preview({ p, width, height, bars = 2, sp = 5 }: { p: Project; width: number; height: number; bars?: number; sp?: number }) {
  const bt = barTicks(p.meter);
  const to = Math.min(totalBars(p), bars) * bt;
  const notes = absoluteNotes(p)
    .filter((n) => n.abs < to)
    .map((n) => ({ ...n, start: n.abs, dur: Math.min(n.dur, to - n.abs) }));
  const lower = p.lowerVoice?.filter((n) => n.start < to).map((n) => ({ ...n, dur: Math.min(n.dur, to - n.start) }));
  return (
    <MiniStaff
      notes={notes}
      lower={lower && lower.length ? lower : p.lowerVoice ? [] : undefined}
      fifths={keyFifths(p.key)}
      meter={p.meter}
      from={0}
      to={to}
      width={width}
      height={height}
      sp={p.lowerVoice ? sp * 0.78 : sp}
      percussion={p.percussive}
      finalBar={false}
    />
  );
}

function TemplatesGrid({ large }: { large?: boolean }) {
  const [active, setActive] = useState<TemplateId>('empty');
  return (
    <div className={`templates ${large ? 'large' : ''}`}>
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`template ${active === t.id ? 'on' : ''}`}
          onClick={() => setActive(t.id)}
          onDoubleClick={() => setUi({ modal: { kind: 'new-project', template: t.id } })}
          onKeyDown={(e) => e.key === 'Enter' && setUi({ modal: { kind: 'new-project', template: t.id } })}
          title="Double-click to create a project from this template"
        >
          <TemplateIcon kind={t.id} />
          <span className="t-name">{t.name}</span>
          <span className="t-hint">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

function ProjectRows({ projects }: { projects: Project[] }) {
  const homeId = useApp((s) => s.homeProjectId);
  const archived = useApp((s) => s.archived);
  if (!projects.length) return <div style={{ padding: '30px 24px', color: 'var(--text-3)' }}>No projects here yet.</div>;
  return (
    <div className="proj-table" role="grid" aria-label="Projects">
      <div className="proj-head" role="row">
        <span>Name</span>
        <span>Preview</span>
        <span>Modified</span>
        <span />
      </div>
      <div className="proj-rows">
        {projects.map((p) => (
          <div
            key={p.id}
            role="row"
            className={`proj-row ${p.id === homeId ? 'sel' : ''}`}
            onClick={() => setUi({ homeProjectId: p.id })}
            onDoubleClick={() => openProject(p.id)}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && openProject(p.id)}
          >
            <span className="proj-name">
              <Doc size={22} />
              <span>
                <span className="n">{p.name}</span>
                <span className="s">{p.subtitle}</span>
              </span>
            </span>
            <span className="proj-preview">
              <Preview p={p} width={344} height={p.lowerVoice ? 56 : 50} />
            </span>
            <span className="proj-mod">
              <span>{formatModified(p.modifiedAt)}</span>
              <span className="s">{totalBars(p)} bars</span>
            </span>
            <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              <MenuButton items={projectMenu(p, archived.includes(p.id))} label={`${p.name} options`} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeView() {
  const projects = useApp((s) => s.projects);
  const archived = useApp((s) => s.archived);
  const section = useApp((s) => s.homeSection);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = projects.filter((p) => !archived.includes(p.id)).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const list =
    section === 'studies'
      ? active.filter((p) => p.kind === 'Study')
      : section === 'archives'
        ? projects.filter((p) => archived.includes(p.id))
        : active;
  const title = { home: 'Recent Projects', all: 'All Projects', studies: 'Studies', archives: 'Archives', templates: 'Recent Projects' }[section];
  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.drawings)) throw new Error('bad file');
      importProject(data);
      toast(`Imported “${data.name}”`);
    } catch {
      toast('That file is not a PHRASIS project');
    }
  };
  return (
    <div className="center home">
      <div className="home-hero">
        <div>
          <h1>Welcome to PHRASIS</h1>
          <p>A laboratory for melodic syntax, rhythm, and form.</p>
        </div>
        <button type="button" className="btn" style={{ height: 40, padding: '0 30px', background: '#e7e6e3' }} onClick={() => setUi({ modal: { kind: 'new-project', template: 'empty' } })}>
          New Project…
        </button>
      </div>
      {(section === 'home' || section === 'templates') && (
        <section className="home-section">
          <div className="home-section-head">
            <span className="caps">Templates</span>
            <span className="spacer" />
            <button type="button" className="link" onClick={() => setUi({ homeSection: section === 'templates' ? 'home' : 'templates' })}>
              {section === 'templates' ? 'Back to Home' : 'All Templates'}
            </button>
            <MenuButton
              label="Template options"
              items={TEMPLATES.map((t) => ({ label: `New ${t.name}…`, onSelect: () => setUi({ modal: { kind: 'new-project', template: t.id } }) }))}
            />
          </div>
          <TemplatesGrid large={section === 'templates'} />
          {section === 'templates' && (
            <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '4px 24px 18px' }}>
              Double-click a template to start a project. Every template creates a period you can reshape in the Period Builder.
            </p>
          )}
        </section>
      )}
      <section className="home-section grow">
        <div className="home-section-head">
          <span className="caps">{title}</span>
          <span className="spacer" />
          <button type="button" className="link" onClick={() => setUi({ homeSection: section === 'all' ? 'home' : 'all' })}>
            {section === 'all' ? 'Recent Projects' : 'All Projects'}
          </button>
          <MenuButton
            label="Project list options"
            items={[
              { label: 'Import project (.json)…', onSelect: () => fileRef.current?.click() },
              { label: 'Keyboard shortcuts', hint: '?', onSelect: () => setUi({ modal: { kind: 'shortcuts' } }) },
              'sep',
              { label: 'Restore demo projects', danger: true, onSelect: resetDemo },
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <ProjectRows projects={list} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Keywords({ p }: { p: Project }) {
  const [adding, setAdding] = useState(false);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {p.keywords.map((k) => (
        <button
          key={k}
          type="button"
          className="chip pill"
          title="Click to remove"
          style={{ cursor: 'pointer' }}
          onClick={() => setProjectMeta({ keywords: p.keywords.filter((x) => x !== k) }, p.id)}
        >
          {k}
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          className="field sm"
          style={{ width: 90, borderRadius: 13 }}
          onKeyDown={(e) => {
            e.stopPropagation();
            const v = (e.target as HTMLInputElement).value.trim();
            if (e.key === 'Enter' && v) {
              if (!p.keywords.includes(v)) setProjectMeta({ keywords: [...p.keywords, v] }, p.id);
              setAdding(false);
            }
            if (e.key === 'Escape') setAdding(false);
          }}
          onBlur={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="chip pill" style={{ width: 26, height: 26, padding: 0, justifyContent: 'center', background: 'transparent', border: '1px solid var(--control-border)', cursor: 'pointer' }} aria-label="Add keyword" onClick={() => setAdding(true)}>
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}

export function HomeInspector() {
  const projects = useApp((s) => s.projects);
  const homeId = useApp((s) => s.homeProjectId);
  const p = projects.find((x) => x.id === homeId) ?? projects[0];
  const size = Math.max(1, Math.round(JSON.stringify(p).length / 1024));
  const rows: Array<[string, string]> = [
    ['Created', formatCreated(p.createdAt)],
    ['Modified', formatModified(p.modifiedAt)],
    ['Duration', `${totalBars(p)} bars`],
    ['Tempo', `${p.tempo} BPM`],
    ['Time Signature', `${p.meter.num}/${p.meter.den}`],
    ['Key', keyLabel(p.key)],
    ['Staves', p.lowerVoice ? '2' : '1'],
    ['Type', p.kind],
    ['Size', `${size} KB`],
  ];
  return (
    <>
      <InspectorHead menu={projectMenu(p, false)} />
      <div className="home-insp-name">
        <EditableText className="name-edit" value={p.name} onCommit={(v) => v.trim() && setProjectMeta({ name: v.trim() }, p.id)} />
      </div>
      <div className="insp-sub" style={{ marginTop: 0 }}>
        {p.subtitle}
      </div>
      <div className="home-preview" onDoubleClick={() => openProject(p.id)} title="Double-click to open">
        <Preview p={p} width={214} height={96} bars={2} sp={5.4} />
      </div>
      <div className="insp-section" style={{ paddingTop: 18 }}>
        <div className="meta-grid">
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="insp-section">
        <div className="insp-label">Keywords</div>
        <Keywords p={p} />
      </div>
      <div className="insp-section">
        <div className="insp-label">Notes</div>
        <EditableText multiline value={p.memo} placeholder="Ideas, intentions, reminders…" onCommit={(v) => setProjectMeta({ memo: v }, p.id)} />
      </div>
      <button type="button" className="btn block" style={{ marginTop: 14 }} onClick={() => openProject(p.id)}>
        Open Project
      </button>
    </>
  );
}
