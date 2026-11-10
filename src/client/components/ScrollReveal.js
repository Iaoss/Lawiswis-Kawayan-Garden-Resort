import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Apple-style scroll animation for every guest page: sections fade and rise
// into view as you scroll, and cards in a grid follow one after another.
// It finds them on its own, so pages need no changes. Anything already on
// screen when the page opens is left alone (no flash), and it does nothing
// for visitors who turned on "reduce motion".
const SECTION_SELECTOR = 'section, article, .section-container';
const SKIP = 'form, [role="dialog"], .rooms-modal, .guest-chat, [data-no-reveal]';
const MAX_STAGGER = 6;

export default function ScrollReveal({ rootSelector = '.client-main' }) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const seen = new WeakSet();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        observer.unobserve(el);
        el.classList.add('is-in');
        // Clean up afterwards so the element is exactly as the page made it.
        const done = () => {
          el.classList.remove('lk-reveal', 'is-in');
          el.style.removeProperty('--lk-delay');
        };
        el.addEventListener('transitionend', done, { once: true });
        setTimeout(done, 1600);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    const fold = () => window.innerHeight * 0.92;
    const prepare = (el, delay = 0) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.closest(SKIP)) return;
      // Sections that animate themselves (Home's own fade-ins) are skipped.
      // .client-page is the page-change fade, which is fine.
      const animated = el.closest('[style*="opacity"]');
      if (animated && !animated.classList.contains('client-page')) return;
      const box = el.getBoundingClientRect();
      if (box.height === 0 || box.top < fold()) return; // already on screen
      if (delay) el.style.setProperty('--lk-delay', `${delay}ms`);
      el.classList.add('lk-reveal');
      observer.observe(el);
    };

    let frame = 0;
    const scan = () => {
      frame = 0;
      const root = document.querySelector(rootSelector);
      if (!root) return;
      root.querySelectorAll(SECTION_SELECTOR).forEach(el => prepare(el));
      // Card grids: each card comes in a moment after the one before it.
      root.querySelectorAll('div, ul, section').forEach(grid => {
        if (seen.has(grid) && grid.dataset.lkGrid) return;
        const count = grid.childElementCount;
        if (count < 2 || count > 30) return;
        const style = window.getComputedStyle(grid);
        if (style.display !== 'grid' || style.gridTemplateColumns.split(' ').length < 2) return;
        grid.dataset.lkGrid = '1';
        seen.add(grid);
        Array.from(grid.children).forEach((card, index) => prepare(card, Math.min(index, MAX_STAGGER) * 80));
      });
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(scan); };

    // Rooms, news and other lists arrive after the page opens.
    const timer = setTimeout(queue, 350);
    const mutations = new MutationObserver(queue);
    const root = document.querySelector(rootSelector);
    if (root) mutations.observe(root, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      document.querySelectorAll('.lk-reveal').forEach(el => el.classList.remove('lk-reveal', 'is-in'));
    };
  }, [pathname, rootSelector]);

  return null;
}
