import type { CSSProperties, ReactNode } from 'react';
import { setView } from '../store/store';
import type { View } from '../store/store';
import { MenuButton } from './ui/Controls';
import type { MenuItem } from './ui/Controls';

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
  menu?: MenuItem[];
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onHeadClick?: () => void;
  active?: boolean;
}

export function Panel({ title, right, menu, children, style, className, onHeadClick, active }: PanelProps) {
  return (
    <section className={`panel ${className ?? ''}`} style={style} aria-label={title}>
      <div className="panel-head">
        <span className="caps" onClick={onHeadClick} style={{ cursor: onHeadClick ? 'pointer' : undefined, color: active === false ? 'var(--text-2)' : undefined }}>
          {title}
        </span>
        <span className="spacer" />
        {right}
        {menu && <MenuButton items={menu} label={`${title} options`} />}
      </div>
      <div className="panel-rule" />
      <div className="panel-body">{children}</div>
    </section>
  );
}
