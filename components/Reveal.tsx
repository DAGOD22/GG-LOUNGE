'use client';
import { useEffect, useRef } from 'react';

/**
 * Fades + lifts its children into place the first time they scroll into view.
 *
 * The class is only added once the element is already mounted, so the page is
 * fully visible and the catalog is fully laid out if JS never runs. Under
 * prefers-reduced-motion the element starts in its final state, and the
 * animation is disabled anyway by the global reduced-motion rule.
 */
export function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }: {
  children: React.ReactNode;
  delay?: number;
  as?: 'div' | 'section' | 'article' | 'li';
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.classList.add('reveal-init');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        node.classList.add('reveal-in');
        observer.disconnect();
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={`reveal ${className}`.trim()}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
