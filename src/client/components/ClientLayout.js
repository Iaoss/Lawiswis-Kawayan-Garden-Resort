import React, { Suspense } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import ChatWidget from './ChatWidget';
import ClientChrome from './ClientChrome';
import ResortAvailabilityNotice from './ResortAvailabilityNotice';
import { ResortAvailabilityProvider } from './ResortAvailabilityContext';

export default function ClientLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  return (
    <ResortAvailabilityProvider>
      <ClientChrome>
        <ResortAvailabilityNotice />
        {/* Keeps the header and footer on screen while a page's code loads. */}
        <Suspense fallback={<div role="status" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#6b7280', fontSize: '13px' }}>Loading…</div>}>
          {/* Pages fade and slide between each other (off for "reduce motion"). */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </Suspense>
        <ChatWidget />
      </ClientChrome>
    </ResortAvailabilityProvider>
  );
}