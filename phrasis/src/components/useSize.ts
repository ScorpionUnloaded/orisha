import { useCallback, useRef, useState } from 'react';

/** Observe an element's content size. Returns a callback ref and the size. */
export function useSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    obs.current?.disconnect();
    obs.current = null;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.width === w && s.height === h ? s : { width: w, height: h }));
    };
    obs.current = new ResizeObserver(measure);
    obs.current.observe(el);
    measure();
  }, []);
  return [ref, size];
}
