import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Full-screen "HP" glass reveal shown when staff open the portal (the login
// page). Plays once per browser session, then fades into the page. Click or
// press Skip / Esc to go straight in.
const GlassRevealHuaPro = lazy(() => import('../../components/ui/liquid-glass-logo-reveal.tsx'));

const SEEN_KEY = 'huapro_intro_seen';
// The reveal runs ~2.5 s (played at 1.4× speed) once the mark has loaded;
// give the finished mark a moment before fading. MAX_MS closes it anyway on
// a very slow device.
const SHOW_MS = 3100;
const REDUCED_MS = 1200;
const MAX_MS = 7000;
const BG = '#ffffff';
const GREEN = '#2f6b3a';

function alreadySeen() {
  try { return window.sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}

export default function StaffPortalIntro() {
  const [open, setOpen] = useState(() => !alreadySeen());
  // Set when the glass reveal actually starts playing.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    markSeen();
    const safety = setTimeout(() => setOpen(false), MAX_MS);
    const onKey = event => { if (event.key === 'Escape' || event.key === 'Enter') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(safety); window.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    if (!open || !started) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setOpen(false), reduce ? REDUCED_MS : SHOW_MS);
    return () => clearTimeout(timer);
  }, [open, started]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="huapro-intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: BG, display: 'grid', placeItems: 'center' }}
        >
          <Suspense fallback={null}>
            <GlassRevealHuaPro loop={false} onReady={() => setStarted(true)} className="absolute inset-0 h-full w-full" style={{ cursor: 'default' }} />
          </Suspense>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={started ? { opacity: 1, y: 0, transition: { delay: 1.8, duration: 0.5, ease: [0.16, 1, 0.3, 1] } } : { opacity: 0, y: 10 }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: '14vh', textAlign: 'center', pointerEvents: 'none', fontFamily: "'Poppins', sans-serif" }}
          >
            <div style={{ color: GREEN, fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, letterSpacing: '0.04em' }}>HuaPro</div>
            <div style={{ color: 'rgba(47,107,58,0.7)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 4 }}>Resort Management System</div>
          </motion.div>
          <button type="button" onClick={() => setOpen(false)}
            style={{ position: 'absolute', top: 18, right: 18, border: '1px solid rgba(47,107,58,0.3)', background: 'rgba(47,107,58,0.06)', color: GREEN, borderRadius: 999, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            Skip
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
