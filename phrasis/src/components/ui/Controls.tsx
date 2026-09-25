import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, More } from './Icons';

// ---------------------------------------------------------------------------
// Popover

interface PopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  minWidth?: number;
}

export function Popover({ anchor, open, onClose, children, align = 'left', minWidth }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 200;
    const h = el?.offsetHeight ?? 200;
    let left = align === 'right' ? r.right - w : r.left;
    let top = r.bottom + 4;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ left, top });
  }, [open, anchor, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className="pop"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, minWidth: minWidth ?? (anchor ? anchor.offsetWidth : 160) }}
      role="presentation"
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Select

export interface Option<T> {
  value: T;
  label: string;
  hint?: string;
}

interface SelectProps<T> {
  value: T;
  options: Array<Option<T> | 'sep'>;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  label?: string;
  display?: ReactNode;
  titlebar?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function Select<T>({ value, options, onChange, className, size = 'md', display, titlebar, style, ariaLabel }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const btn = useRef<HTMLButtonElement>(null);
  const opts = options.filter((o): o is Option<T> => o !== 'sep');
  const current = opts.find((o) => Object.is(o.value, value) || JSON.stringify(o.value) === JSON.stringify(value));

  const choose = (v: T) => {
    setOpen(false);
    onChange(v);
    btn.current?.focus();
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      setActive(Math.max(0, opts.indexOf(current!)));
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(opts.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opts[active]) choose(opts[active].value);
    }
  };

  let idx = -1;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`${titlebar ? 'tb-select' : `select ${size === 'sm' ? 'sm' : ''}`} ${className ?? ''}`}
        onClick={() => {
          setOpen((o) => !o);
          setActive(Math.max(0, opts.indexOf(current!)));
        }}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={style}
      >
        <span>{display ?? current?.label ?? '—'}</span>
        <ChevronDown size={titlebar ? 15 : 13} />
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)}>
        <div role="listbox">
          {options.map((o, i) => {
            if (o === 'sep') return <div key={`s${i}`} className="pop-sep" />;
            idx++;
            const my = idx;
            const selected = o === current;
            return (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={selected}
                className={`pop-item ${my === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(my)}
                onClick={() => choose(o.value)}
              >
                <span className="check">{selected ? '✓' : ''}</span>
                {o.label}
                {o.hint && <span className="kbd">{o.hint}</span>}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Menu (… buttons)

export type MenuItem =
  | { label: string; onSelect: () => void; hint?: string; danger?: boolean; checked?: boolean; disabled?: boolean }
  | { title: string }
  | 'sep';

export function MenuButton({ items, label = 'More', size = 20, align = 'right' }: { items: MenuItem[]; label?: string; size?: number; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <More size={size} />
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} align={align} minWidth={200}>
        <div role="menu">
          {items.map((it, i) => {
            if (it === 'sep') return <div key={i} className="pop-sep" />;
            if ('title' in it) return <div key={i} className="pop-title">{it.title}</div>;
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={`pop-item ${it.danger ? 'danger' : ''}`}
                style={it.disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                <span className="check">{it.checked ? '✓' : ''}</span>
                {it.label}
                {it.hint && <span className="kbd">{it.hint}</span>}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Slider, toggle, segmented

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, ariaLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState<number | null>(null);
  const v = local ?? value;
  const f = (v - min) / (max - min);
  const fromEvent = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round((min + t * (max - min)) / step) * step;
  };
  return (
    <div
      ref={ref}
      className="slider"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number(v.toFixed(3))}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setLocal(fromEvent(e.clientX));
      }}
      onPointerMove={(e) => {
        if (local !== null) setLocal(fromEvent(e.clientX));
      }}
      onPointerUp={(e) => {
        if (local !== null) onChange(fromEvent(e.clientX));
        setLocal(null);
      }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step * 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step * 5 : 0;
        if (d) {
          e.preventDefault();
          onChange(Math.max(min, Math.min(max, value + d)));
        }
      }}
    >
      <div className="track" />
      <div className="fill-bar" style={{ width: `${f * 100}%` }} />
      <div className="knob" style={{ left: `calc(10px + ${f} * (100% - 20px))` }} />
    </div>
  );
}

export function Toggle({ on, onChange, large, ariaLabel }: { on: boolean; onChange: (v: boolean) => void; large?: boolean; ariaLabel?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={ariaLabel} className={`toggle ${large ? 'lg' : ''} ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Inline editable text used by inspectors. */
export function EditableText({ value, onCommit, className, multiline, placeholder }: { value: string; onCommit: (v: string) => void; className?: string; multiline?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline)
    return (
      <textarea
        className={className ?? 'textarea'}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.stopPropagation()}
      />
    );
  return (
    <input
      className={className ?? 'field'}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
