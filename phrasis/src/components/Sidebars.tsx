import { useRef, useState } from 'react';
import { COLLECTIONS } from '../model/demo';
import { CADENCES, CADENCE_ORDER, deriveMembers } from '../model/syntax';
import type { CadenceType } from '../model/types';
import {
  addDrawing,
  addMember,
  addMotif,
  addMotifToProject,
  currentProject,
  openProject,
  select,
  selectMotif,
  setCadence,
  setUi,
  setView,
  toast,
  toggleExpanded,
  useApp,
  useProject,
} from '../store/store';
import type { HomeSection, LibraryFilter } from '../store/store';
import { Popover } from './ui/Controls';
import {
  Angle,
  Archive,
  BarsIcon,
  Cap,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cube,
  Doc,
  DocSplit,
  Drive,
  Heart,
  Hierarchy,
  Home,
  LibraryIcon,
  Plus,
  User,
} from './ui/Icons';

function PlusMenu({ label, items }: { label: string; items: Array<{ label: string; onSelect: () => void }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" className="icon-btn" aria-label={label} onClick={() => setOpen((o) => !o)}>
        <Plus size={19} />
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} align="left" minWidth={190}>
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            className="pop-item"
            onClick={() => {
              setOpen(false);
              it.onSelect();
            }}
          >
            <span className="check" />
            {it.label}
          </button>
        ))}
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------

export function SyntaxSidebar() {
  const project = useProject();
  const selection = useApp((s) => s.selection);
  const expanded = useApp((s) => s.expanded);
  const view = useApp((s) => s.view);
  const library = useApp((s) => s.library);
  const members = deriveMembers(project);
  const selDrawing = selection.kind === 'drawing' ? project.drawings.find((d) => d.id === selection.id) : undefined;
  const activeCadence: CadenceType | undefined = selDrawing
    ? members.find((m) => m.drawingIds.includes(selDrawing.id))?.cadence
    : selection.kind === 'member'
      ? members.find((m) => m.id === selection.id)?.cadence
      : undefined;
  const motifs = project.motifs.map((id) => library.find((m) => m.id === id)).filter(Boolean) as typeof library;
  const available = library.filter((m) => !project.motifs.includes(m.id));

  const goEditor = () => {
    if (view === 'period') setView('composer');
  };

  return (
    <aside className="sidebar" aria-label="Syntax tree">
      <div className="side-head">
        <span className="caps">Syntax Tree</span>
        <PlusMenu
          label="Add to syntax tree"
          items={[
            { label: 'Add drawing after selection', onSelect: () => addDrawing() },
            { label: 'Add member', onSelect: addMember },
          ]}
        />
      </div>
      <div role="tree">
        <button
          type="button"
          role="treeitem"
          aria-expanded={!!expanded.period}
          className={`tree-row ${selection.kind === 'period' && view !== 'period' ? 'selected' : ''}`}
          style={{ paddingLeft: 4 }}
          onClick={() => {
            select({ kind: 'period' });
            goEditor();
          }}
        >
          <span
            className="chev"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded('period');
            }}
          >
            {expanded.period ? <ChevronDown /> : <ChevronRight />}
          </span>
          <span className="doc">
            <Doc />
          </span>
          {project.periodName}
        </button>
        {expanded.period &&
          members.map((m) => {
            const open = !!expanded[m.id];
            const isParent = selection.kind === 'drawing' && m.drawingIds.includes(selection.id);
            const isSel = selection.kind === 'member' && selection.id === m.id;
            return (
              <div key={m.id} role="group">
                <button
                  type="button"
                  role="treeitem"
                  aria-expanded={open}
                  className={`tree-row ${isSel ? 'selected' : isParent && open ? 'parent' : ''}`}
                  style={{ paddingLeft: 28 }}
                  onClick={() => {
                    select({ kind: 'member', id: m.id });
                    if (!open) toggleExpanded(m.id);
                    goEditor();
                  }}
                >
                  <span
                    className="chev"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(m.id);
                    }}
                  >
                    {open ? <ChevronDown /> : <ChevronRight />}
                  </span>
                  <span className="doc">
                    <DocSplit />
                  </span>
                  {m.name}
                </button>
                {open &&
                  m.drawingIds.map((id, i) => {
                    const sel = selection.kind === 'drawing' && selection.id === id && view !== 'period';
                    const d = project.drawings.find((x) => x.id === id)!;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="treeitem"
                        className={`tree-row ${sel ? 'selected' : ''}`}
                        style={{ paddingLeft: 52 }}
                        title={`Drawing ${d.label}`}
                        onClick={() => {
                          select({ kind: 'drawing', id });
                          goEditor();
                        }}
                        onDoubleClick={() => setView('composer')}
                      >
                        <span className="doc" style={{ marginLeft: 4 }}>
                          <Doc />
                        </span>
                        Drawing {i + 1}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        <button type="button" role="treeitem" className={`tree-row ${view === 'period' ? 'selected' : ''}`} style={{ paddingLeft: 28 }} onClick={() => setView('period')}>
          <span className="chev" />
          <span className="doc">
            <Hierarchy />
          </span>
          Period Builder
        </button>
      </div>

      <div className="side-sep" />
      <div className="side-title">
        Motifs
        <PlusMenu
          label="Add motif to project"
          items={[
            ...available.slice(0, 12).map((m) => ({ label: `Use ${m.name}`, onSelect: () => addMotifToProject(m.id) })),
            { label: 'Open motif library…', onSelect: () => setView('motif') },
          ]}
        />
      </div>
      {motifs.map((m) => (
        <button
          key={m.id}
          type="button"
          className="side-item"
          onClick={() => {
            selectMotif(m.id);
            setView('motif');
          }}
          title={`Edit ${m.name}`}
        >
          <span className="sym">{m.symbol}</span>
          {m.name}
        </button>
      ))}

      <div className="side-sep" />
      <div className="side-title">
        Cadences
        <PlusMenu
          label="Set rest point"
          items={CADENCE_ORDER.map((c) => ({
            label: `${CADENCES[c].long} after selection`,
            onSelect: () => {
              const s = useApp.getState();
              const p = currentProject(s);
              const id = s.selection.kind === 'drawing' ? s.selection.id : s.selection.kind === 'member' ? deriveMembers(p).find((m) => m.id === (s.selection as { id: string }).id)?.drawingIds.slice(-1)[0] : undefined;
              if (id) setCadence(id, c);
              else toast('Select a drawing first');
            },
          }))}
        />
      </div>
      {(['quarter', 'half', 'full'] as CadenceType[]).map((c) => (
        <button
          key={c}
          type="button"
          className="side-item"
          onClick={() => {
            const target = selDrawing?.id ?? (selection.kind === 'member' ? members.find((m) => m.id === selection.id)?.drawingIds.slice(-1)[0] : undefined);
            if (target) setCadence(target, c);
            else toast('Select a drawing to punctuate');
          }}
          title={`Close the selection with a ${CADENCES[c].label.toLowerCase()} cadence`}
        >
          <span className="lead">
            <span className={`cad-dot ${activeCadence === c ? 'on' : ''}`} />
          </span>
          {c === 'full' ? 'Full (I)' : CADENCES[c].label}
        </button>
      ))}
    </aside>
  );
}

// ---------------------------------------------------------------------------

export function MotifLibrarySidebar() {
  const library = useApp((s) => s.library);
  const filter = useApp((s) => s.libraryFilter);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const is = (f: LibraryFilter) => filter.kind === f.kind && (f.kind !== 'collection' || (filter.kind === 'collection' && filter.id === f.id));
  const setFilter = (f: LibraryFilter) => {
    setUi({ libraryFilter: f });
    const first = library.find((m) => matchesFilter(m, f));
    if (first) selectMotif(first.id);
  };
  const cats: Array<{ f: LibraryFilter; label: string; icon: React.ReactNode; group?: string }> = [
    { f: { kind: 'all' }, label: 'All Motifs', icon: <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--blue)', display: 'block' }} /> },
    { f: { kind: 'user' }, label: 'User Motifs', icon: <User /> },
    { f: { kind: 'core' }, label: 'Core Library', icon: <Cube /> },
    { f: { kind: 'rhythmic' }, label: 'Rhythmic', icon: <BarsIcon size={18} /> },
    { f: { kind: 'intervals' }, label: 'Intervals', icon: <Angle />, group: 'intervals' },
    { f: { kind: 'contour' }, label: 'Contour Types', icon: <Angle />, group: 'contour' },
    { f: { kind: 'favourites' }, label: 'Favourites', icon: <Heart /> },
  ];
  return (
    <aside className="sidebar" aria-label="Motif library">
      <div className="side-head">
        <span className="caps">Motif Library</span>
        <button type="button" className="icon-btn" aria-label="New motif" onClick={addMotif}>
          <Plus size={19} />
        </button>
      </div>
      {cats.map((c) => {
        const count = library.filter((m) => matchesFilter(m, c.f)).length;
        const open = c.group ? openGroups[c.group] : false;
        return (
          <div key={c.label}>
            <button type="button" className={`side-item ${is(c.f) ? 'selected' : ''}`} onClick={() => setFilter(c.f)} style={{ paddingLeft: c.group ? 0 : 8 }}>
              {c.group && (
                <span
                  className="chev"
                  style={{ width: 14, display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenGroups((g) => ({ ...g, [c.group!]: !g[c.group!] }));
                  }}
                >
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              )}
              <span className="lead">{c.icon}</span>
              {c.label}
              <span className="count">{count}</span>
            </button>
            {open &&
              library
                .filter((m) => matchesFilter(m, c.f))
                .map((m) => (
                  <button key={m.id} type="button" className="side-item" style={{ paddingLeft: 52, height: 30, fontSize: 14 }} onClick={() => selectMotif(m.id)}>
                    <span className="sym" style={{ width: 18, fontSize: 16 }}>
                      {m.symbol}
                    </span>
                    {m.name}
                  </button>
                ))}
          </div>
        );
      })}
      <div className="side-sep" />
      <div className="side-head" style={{ height: 56 }}>
        <span className="caps">Collections</span>
        <button type="button" className="icon-btn" aria-label="New collection" onClick={() => toast('Collections are curated in this build — tag motifs from the inspector')}>
          <Plus size={19} />
        </button>
      </div>
      {COLLECTIONS.map((c) => (
        <button key={c.id} type="button" className={`side-item ${is({ kind: 'collection', id: c.id }) ? 'selected' : ''}`} onClick={() => setFilter({ kind: 'collection', id: c.id })}>
          <span className="lead">
            <Doc />
          </span>
          {c.name}
          <span className="count">{library.filter((m) => m.collections.includes(c.id)).length}</span>
        </button>
      ))}
    </aside>
  );
}

export function matchesFilter(m: { category: string; groups: string[]; favourite: boolean; collections: string[] }, f: LibraryFilter): boolean {
  switch (f.kind) {
    case 'all':
      return true;
    case 'user':
    case 'core':
    case 'rhythmic':
      return m.category === f.kind;
    case 'intervals':
    case 'contour':
      return m.groups.includes(f.kind);
    case 'favourites':
      return m.favourite;
    case 'collection':
      return m.collections.includes(f.id);
  }
}

// ---------------------------------------------------------------------------

export function StudioSidebar() {
  const projects = useApp((s) => s.projects);
  const archived = useApp((s) => s.archived);
  const projectId = useApp((s) => s.projectId);
  const homeId = useApp((s) => s.homeProjectId);
  const section = useApp((s) => s.homeSection);
  const nav: Array<{ id: HomeSection | 'library'; label: string; icon: React.ReactNode }> = [
    { id: 'home', label: 'Home', icon: <Home /> },
    { id: 'library', label: 'Library', icon: <LibraryIcon /> },
    { id: 'templates', label: 'Templates', icon: <Doc size={20} /> },
    { id: 'studies', label: 'Studies', icon: <Cap /> },
    { id: 'archives', label: 'Archives', icon: <Archive /> },
  ];
  const recent = [...projects].filter((p) => !archived.includes(p.id)).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 10);
  const twoDays = Date.now() - 2 * 86400000;
  return (
    <aside className="sidebar" aria-label="Studio">
      <div className="side-head" style={{ height: 56 }}>
        <span className="caps">Studio</span>
      </div>
      {nav.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`side-item ${section === n.id ? 'selected' : ''}`}
          onClick={() => (n.id === 'library' ? setView('motif') : setUi({ homeSection: n.id as HomeSection }))}
        >
          <span className="lead">{n.icon}</span>
          {n.label}
        </button>
      ))}
      <div className="side-sep" />
      <div className="side-head" style={{ height: 52 }}>
        <span className="caps">Recent</span>
      </div>
      {recent.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`side-item ${homeId === p.id && section !== 'home' ? '' : ''}`}
          onClick={() => setUi({ homeProjectId: p.id })}
          onDoubleClick={() => openProject(p.id)}
          title="Double-click to open"
        >
          <span className="lead">
            <Doc />
          </span>
          {p.name}
          {(p.id === projectId || new Date(p.modifiedAt).getTime() > twoDays) && <span className={`status-dot ${p.id === projectId ? 'open' : ''}`} />}
        </button>
      ))}
      <div className="side-sep" />
      <div className="side-head" style={{ height: 52 }}>
        <span className="caps">Cloud</span>
      </div>
      <button type="button" className="side-item" onClick={() => toast('Cloud sync is not available in the web build — projects are saved in this browser')}>
        <span className="lead">
          <Cloud />
        </span>
        iCloud Drive
      </button>
      <button type="button" className="side-item" onClick={() => toast('Projects are stored locally in this browser')}>
        <span className="lead">
          <Drive />
        </span>
        On My Mac
      </button>
    </aside>
  );
}
