import type { CSSProperties, ReactNode } from 'react';
import { focusPane, setUi, setView, useApp } from '../store/store';
import type { FocusPane, View } from '../store/store';
import { MenuButton } from './ui/Controls';
import type { MenuItem } from './ui/Controls';
import { Collapse } from './ui/Icons';

export const VIEW_ITEMS = (current: View): MenuItem[] => [
  { title: 'Workspace' },
  { label: 'Studio Home', hint: '⌘1', checked: current === 'home', onSelect: () => setView('home') },
  { label: 'Composer', hint: '⌘2', checked: current === 'composer', onSelect: () => setView('composer') },
  { label: 'Rhythm Lab', hint: '⌘3', checked: current === 'rhythm', onSelect: () => setView('rhythm') },
  { label: 'Motif Drawing Editor', hint: '⌘4', checked: current === 'motif', onSelect: () => setView('motif') },
  { label: 'Period Builder', hint: '⌘5', checked: current === 'period', onSelect: () => setView('period') },
];

interface PanelProps {
  title: string;
  right?: ReactNode;
  /** Toolbar placed right after the title. */
  tools?: ReactNode;
  menu?: MenuItem[];
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onHeadClick?: () => void;
  active?: boolean;
  /** Keyboard focus target: clicking inside the panel routes arrow keys to it. */
  pane?: FocusPane;
  /** Makes the panel collapsible under this id. */
  collapseId?: string;
}

export function Panel({ title, right, tools, menu, children, style, className, onHeadClick, active, pane, collapseId }: PanelProps) {
  const focused = useApp((s) => !!pane && s.focusPane === pane && s.view === 'composer');
  const collapsed = useApp((s) => (collapseId ? !!s.collapsed[collapseId] : false));
  const toggle = () => collapseId && setUi({ collapsed: { ...useApp.getState().collapsed, [collapseId]: !collapsed } });
  return (
    <section
      className={`panel ${className ?? ''} ${focused ? 'focused' : ''} ${collapsed ? 'collapsed' : ''}`}
      style={collapsed ? { ...style, flex: '0 0 auto' } : style}
      aria-label={title}
      onPointerDownCapture={pane ? () => focusPane(pane) : undefined}
    >
      <div className="panel-head">
        {collapseId && (
          <button type="button" className="icon-btn collapse-btn" onClick={toggle} aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} aria-expanded={!collapsed}>
            <Collapse open={!collapsed} />
          </button>
        )}
        <span className="caps panel-title" onClick={onHeadClick ?? (collapseId ? toggle : undefined)} style={{ cursor: onHeadClick || collapseId ? 'pointer' : undefined, color: active === false ? 'var(--text-2)' : undefined }} title={pane ? (focused ? 'Keyboard focus is here' : 'Click inside to give this editor the arrow keys') : undefined}>
          {title}
        </span>
        {!collapsed && tools}
        <span className="spacer" />
        {!collapsed && right}
        {menu && <MenuButton items={menu} label={`${title} options`} />}
      </div>
      {!collapsed && <div className="panel-rule" />}
      {!collapsed && <div className="panel-body">{children}</div>}
    </section>
  );
}
