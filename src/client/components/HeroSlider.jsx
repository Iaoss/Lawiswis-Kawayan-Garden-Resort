import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// Resort photos, served from /public/images/resort.
const PHOTOS = `${process.env.PUBLIC_URL || ''}/images/resort`;
export const HERO_SLIDES = [
  { src: `${PHOTOS}/serenity-pool.webp`, alt: 'The Serenity pool surrounded by gardens' },
  { src: `${PHOTOS}/bamboo-cabanas.webp`, alt: 'Curtained cabanas in the bamboo garden' },
  { src: `${PHOTOS}/garden-terrace.webp`, alt: 'A couple sharing drinks on a garden terrace' },
  { src: `${PHOTOS}/veranda-lounge.webp`, alt: 'Veranda lounge overlooking the trees' },
  { src: `${PHOTOS}/lanterns-sunset.webp`, alt: 'Lanterns glowing in the trees at sunset' },
  { src: `${PHOTOS}/fireside-friends.webp`, alt: 'Friends roasting marshmallows by the fire pit' },
  { src: `${PHOTOS}/bonfire-gathering.webp`, alt: 'Group gathering around the bonfire under string lights' },
  { src: `${PHOTOS}/garden-walk.webp`, alt: 'A couple walking the garden path' },
];

const SLIDE_MS = 4000;

// Auto-playing hero carousel (a new photo every 4 seconds): crossfade with a
// slow zoom, dots to jump to a photo, and a pause button. With "reduce
// motion" on, photos still change but without the zoom.
// showControls={false} hides the dots and pause button; photos still change on their own.
export default function HeroSlider({ slides = HERO_SLIDES, offsetY = 0, showControls = true }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const count = slides.length;
  const go = useCallback(step => setIndex(current => (current + step + count) % count), [count]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Keeps changing on its own. It only stops when the visitor presses pause
  // or the tab is hidden. (It used to pause on hover, but the hero fills the
  // screen, so the mouse was nearly always over it and it never moved.)
  const playing = !paused && !hidden && count > 1;
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
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          // The first photo is what visitors see first, so fetch it ahead of everything else.
          fetchpriority={index === 0 ? 'high' : 'auto'}
          decoding="async"
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

      {showControls && count > 1 && (
        <>
          <div style={{ position: 'absolute', zIndex: 3, left: '50%', bottom: 22, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {slides.map((item, i) => (
              <button key={item.src} type="button" aria-label={`Show photo ${i + 1}: ${item.alt}`} aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
                style={{ width: i === index ? 26 : 9, height: 9, padding: 0, borderRadius: 999, border: 0, cursor: 'pointer', background: i === index ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width .3s, background .3s' }} />
            ))}
            <button type="button" aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} onClick={() => setPaused(value => !value)}
              style={{ ...control, position: 'static', width: 30, height: 30, fontSize: 11, marginLeft: 6 }}>
              {paused ? '▶' : '❚❚'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
