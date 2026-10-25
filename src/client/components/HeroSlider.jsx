import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// Photos from the resort's website (lawiswiskawayanresort.com).
const UPLOADS = 'https://lawiswiskawayanresort.com/wp-content/uploads';
export const HERO_SLIDES = [
  { src: `${UPLOADS}/2020/01/hero192x-scaled.jpg`, alt: 'Lawiswis Kawayan Garden Resort' },
  { src: `${UPLOADS}/2024/09/Serenity-Springs-by-Nature-scaled-1.jpeg`, alt: 'Serenity Springs by Nature at Lawiswis Kawayan' },
  { src: `${UPLOADS}/2020/01/Pavillion-Featured.jpg`, alt: 'The Pavilion' },
  { src: `${UPLOADS}/2024/09/Paraiso-03-1400x700-1-1200x600.jpeg`, alt: 'Paraiso Suite' },
  { src: `${UPLOADS}/2024/11/349573106_214182444757352_8525037380621928322_n-1200x800.jpg`, alt: 'Life at Lawiswis Kawayan' },
  { src: `${UPLOADS}/2024/10/Himbing-01-1400x700-1.jpeg`, alt: 'Himbing room' },
  { src: `${UPLOADS}/2024/10/2017-11.jpg`, alt: 'The resort grounds' },
];

const SLIDE_MS = 6000;

// Auto-playing hero carousel: crossfade with a slow zoom, pauses on hover,
// keyboard focus or when the tab is hidden, and has a pause button. With
// "reduce motion" on it doesn't auto-play or zoom.
export default function HeroSlider({ slides = HERO_SLIDES, offsetY = 0 }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const count = slides.length;
  const go = useCallback(step => setIndex(current => (current + step + count) % count), [count]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const playing = !reduceMotion && !paused && !hovered && !hidden && count > 1;
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [playing, index, go]);

  // Load the next photo early so the crossfade never shows a blank.
  useEffect(() => {
    const next = new Image();
    next.src = slides[(index + 1) % count].src;
  }, [index, count, slides]);

  const slide = slides[index];
  const control = {
    position: 'absolute', zIndex: 3, display: 'grid', placeItems: 'center', width: 40, height: 40,
    borderRadius: '50%', border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(20,25,15,0.35)',
    color: '#fff', cursor: 'pointer', fontSize: 18, backdropFilter: 'blur(2px)',
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Resort photos"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${count}: ${slide.alt}`}
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.08 }}
          animate={{ opacity: 1, scale: reduceMotion ? 1 : 1.02 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.2, ease: 'easeInOut' }, scale: { duration: SLIDE_MS / 1000 + 1.2, ease: 'linear' } }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '112%', objectFit: 'cover', objectPosition: 'center',
            top: offsetY, willChange: 'opacity, transform',
          }}
        />
      </AnimatePresence>

      {count > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} style={{ ...control, left: 16, top: '50%', transform: 'translateY(-50%)' }}>‹</button>
          <button type="button" aria-label="Next photo" onClick={() => go(1)} style={{ ...control, right: 16, top: '50%', transform: 'translateY(-50%)' }}>›</button>
          <div style={{ position: 'absolute', zIndex: 3, left: '50%', bottom: 22, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {slides.map((item, i) => (
              <button key={item.src} type="button" aria-label={`Show photo ${i + 1}: ${item.alt}`} aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
                style={{ width: i === index ? 26 : 9, height: 9, padding: 0, borderRadius: 999, border: 0, cursor: 'pointer', background: i === index ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width .3s, background .3s' }} />
            ))}
            {!reduceMotion && (
              <button type="button" aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} onClick={() => setPaused(value => !value)}
                style={{ ...control, position: 'static', width: 30, height: 30, fontSize: 11, marginLeft: 6 }}>
                {paused ? '▶' : '❚❚'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
