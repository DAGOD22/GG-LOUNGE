'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Counts from 0 to `value` the first time it becomes visible.
 *
 * Server output is always the real number: the counter only drops to 0 once
 * the effect has run and it has confirmed the element is off-screen, so the
 * rendered HTML (and anything reading it, including crawlers) shows the true
 * figure rather than a mid-animation value. Driven by rAF progress, so a
 * dropped frame shortens the animation instead of stretching it.
 *
 * (The first version initialised state from `value` but the pre-hydration
 * render is not the only one that matters — the snapshot the crawler saw was
 * -697, because the counter had already been reset to 0 and was mid-flight
 * when the page was serialised.)
 */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || value <= 0 || started.current) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || started.current) return;
      started.current = true;
      observer.disconnect();
      // The rAF timestamp is the frame's start time, which can be EARLIER than
      // the performance.now() captured right here — that made the first frame's
      // delta negative and rendered numbers like "-915 games" in production.
      // Baseline on the first frame instead, and clamp regardless.
      let start: number | null = null;
      const tick = (now: number) => {
        if (start === null) start = now;
        const progress = Math.min(1, Math.max(0, (now - start) / duration));
        setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(tick);
        else setShown(value);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{shown}</span>;
}
