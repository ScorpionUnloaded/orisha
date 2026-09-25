import type { ReactNode } from 'react';
import { MenuButton } from '../ui/Controls';
import type { MenuItem } from '../ui/Controls';

export function InspectorHead({ menu }: { menu?: MenuItem[] }) {
  return (
    <div className="insp-head">
      <span className="caps">Inspector</span>
      {menu ? <MenuButton items={menu} label="Inspector options" /> : <span />}
    </div>
  );
}

export function Row({ label, children, compact, className }: { label: ReactNode; children: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={`row ${compact ? 'compact' : ''} ${className ?? ''}`}>
      <span>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** OPEN ——●—— CLOSED closure meter for rest points. */
export function ClosureMeter({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ margin: '4px 0 8px' }} aria-label={`Closure ${value} of 100`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-3)', marginBottom: 6 }}>
        <span>OPEN</span>
        <span>CLOSED</span>
      </div>
      <div style={{ position: 'relative', height: 16 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 2, background: 'linear-gradient(90deg, #d9d8d4, var(--orange))', borderRadius: 1 }} />
        <div style={{ position: 'absolute', left: `calc(${value}% - 6px)`, top: 2, width: 12, height: 12, borderRadius: 6, background: 'var(--orange)', boxShadow: '0 0 0 3px rgba(240,124,27,0.18)' }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
        {value} · {label}
      </div>
    </div>
  );
}
