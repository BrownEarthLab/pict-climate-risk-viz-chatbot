import { useEffect, useRef, useState } from "react";

/**
 * Returns the rendered size of a container ref, updating on resize.
 * Charts receive width/height as props (architecture.md Decision 1) — this is
 * the only place a size is measured imperatively.
 */
export function useDimensions<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
