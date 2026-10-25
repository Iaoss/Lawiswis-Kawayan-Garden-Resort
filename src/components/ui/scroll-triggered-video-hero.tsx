import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

// Scroll-driven "chapters" hero: the background (photo or video) changes as
// you scroll through the section, and each chapter's text reveals in turn.
// Adapted for the resort: chapters are passed in, photos or videos both
// work, colours follow the resort theme, and the progress pill only shows
// while the section is on screen.

export interface Chapter {
  id: string;
  /** Small label above the title, e.g. "Since 2006". */
  eyebrow: string;
  title: string;
  description: string;
  image?: string;
  video?: string;
  alt?: string;
  action?: { label: string; onClick: () => void };
}

const ACCENT = '#C9A867';

const textContainer = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const textReveal = {
  hidden: { y: '100%', opacity: 0 },
  visible: { y: '0%', opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
};
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.3, ease: 'easeOut' } },
};

function FilmGrain() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 opacity-[0.06] mix-blend-overlay">
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />
    </div>
  );
}

function Background({ chapters, activeIndex, reduceMotion }: { chapters: Chapter[]; activeIndex: number; reduceMotion: boolean }) {
  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-black">
      {chapters.map((chapter, index) => (
        <motion.div
          key={chapter.id}
          initial={false}
          animate={{ opacity: index === activeIndex ? 1 : 0, zIndex: index === activeIndex ? 10 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 1.2, ease: 'easeInOut' }}
          className="absolute inset-0 h-full w-full"
          aria-hidden={index !== activeIndex}
        >
          {chapter.video ? (
            <video src={chapter.video} className="h-full w-full object-cover" autoPlay={!reduceMotion} muted loop playsInline />
          ) : (
            <motion.img
              src={chapter.image}
              alt={chapter.alt || ''}
              className="h-full w-full object-cover"
              loading={index === 0 ? 'eager' : 'lazy'}
              animate={{ scale: index === activeIndex && !reduceMotion ? 1.06 : 1 }}
              transition={{ duration: 8, ease: 'linear' }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
        </motion.div>
      ))}
      <FilmGrain />
    </div>
  );
}

function ProgressPill({ chapters, activeIndex, progress }: { chapters: Chapter[]; activeIndex: number; progress: MotionValue<number> }) {
  const smoothProgress = useSpring(progress, { stiffness: 100, damping: 30 });
  return (
    <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/70 p-2 pl-6 pr-2 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-widest text-white/50">Chapter {chapters[activeIndex].id}</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={activeIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="min-w-[110px] text-xs font-bold text-white"
          >
            {chapters[activeIndex].eyebrow}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="relative flex h-12 w-12 items-center justify-center">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="18" stroke="rgba(255,255,255,0.12)" strokeWidth="2" fill="none" />
          <motion.circle cx="24" cy="24" r="18" stroke={ACCENT} strokeWidth="2" fill="none" style={{ pathLength: smoothProgress }} />
        </svg>
        <span className="absolute text-[11px] font-bold text-white">{activeIndex + 1}/{chapters.length}</span>
      </div>
    </div>
  );
}

export default function CinematicScroll({ chapters, className }: { chapters: Chapter[]; className?: string }) {
  const containerRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });

  useEffect(() => scrollYProgress.on('change', latest => {
    setActiveIndex(Math.min(Math.floor(latest * chapters.length), chapters.length - 1));
  }), [scrollYProgress, chapters.length]);

  return (
    <section ref={containerRef} aria-label="Our story" className={cn('relative w-full', className)} style={{ height: `${chapters.length * 100}vh` }}>
      {/* Background and progress pill stay pinned while the chapters scroll past. */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <Background chapters={chapters} activeIndex={activeIndex} reduceMotion={reduceMotion} />
        <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 scale-90 md:bottom-6 md:scale-100">
          <ProgressPill chapters={chapters} activeIndex={activeIndex} progress={scrollYProgress} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-30">
        {chapters.map(chapter => (
          <div key={chapter.id} className="flex h-screen w-full items-center justify-start px-5 pb-20 pt-24 md:px-24 md:py-0">
            <motion.div
              variants={textContainer}
              initial={reduceMotion ? 'visible' : 'hidden'}
              whileInView="visible"
              viewport={{ once: false, margin: '-20%' }}
              className="pointer-events-auto max-w-4xl"
            >
              <motion.div variants={fadeIn} className="mb-4 flex items-center gap-3 md:mb-6 md:gap-4">
                <div className="h-0.5 w-8 md:w-12" style={{ background: ACCENT }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] md:text-xs md:tracking-[0.3em]" style={{ color: ACCENT }}>
                  Chapter {chapter.id} · {chapter.eyebrow}
                </span>
              </motion.div>

              <div className="mb-4 overflow-hidden py-2 md:mb-6">
                <motion.h2
                  variants={textReveal}
                  className="text-[30px] font-medium leading-[1.08] tracking-tight text-white sm:text-5xl md:text-7xl md:leading-none"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  {chapter.title}
                </motion.h2>
              </div>

              <motion.div variants={fadeIn} className="max-w-md rounded-2xl border border-white/10 bg-black/25 p-4 shadow-2xl backdrop-blur-md md:bg-white/5 md:p-6">
                <p className="text-sm font-light leading-relaxed text-white/90 md:text-lg">{chapter.description}</p>
              </motion.div>

              {chapter.action && (
                <motion.button
                  type="button"
                  variants={fadeIn}
                  whileHover={reduceMotion ? undefined : { scale: 1.04, x: 8 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                  onClick={chapter.action.onClick}
                  className="group mt-6 flex items-center gap-4 font-semibold text-white md:mt-10"
                >
                  <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/30">
                    <span className="absolute inset-0 translate-y-full bg-white transition-transform duration-300 group-hover:translate-y-0" />
                    <ChevronRight size={20} className="relative z-10 transition-colors duration-300 group-hover:text-black" />
                  </span>
                  <span className="text-xs uppercase tracking-widest">{chapter.action.label}</span>
                </motion.button>
              )}
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}
