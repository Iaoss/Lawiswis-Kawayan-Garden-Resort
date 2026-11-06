import React, { useEffect, useState } from 'react';
import { useResortAvailability } from './ResortAvailabilityContext';
import { formatClosedRange } from '../../lib/closedDates';

const DISMISSED_KEY = 'lkgr_unavailable_notice_dismissed';
const NOTE_DISMISSED_KEY = 'lkgr_resort_note_dismissed';

const readSession = key => {
  try { return window.sessionStorage.getItem(key) || ''; } catch { return ''; }
};
const writeSession = (key, value) => {
  try { window.sessionStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

// Floats over the page (bottom-left), so the see-through top bar can't hide it.
function FloatingNote({ tone, icon, title, children, onClose }) {
  const colors = tone === 'red'
    ? { bg: '#7f1d1d', text: '#fff', border: '#991b1b' }
    : { bg: '#fffbeb', text: '#78350f', border: '#fcd34d' };
  return (
    <div role="status" className="resort-floating-note" style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>{title}</strong>
        {children}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close notice"
          style={{ background: 'transparent', border: 0, color: 'inherit', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 2, opacity: 0.75 }}>×</button>
      )}
      <style>{`
        .resort-floating-note { position: fixed; left: 18px; bottom: 18px; z-index: 1500; max-width: 380px; display: flex; gap: 10px; align-items: flex-start;
          padding: 13px 14px; border-radius: 14px; font: 13px/1.5 'Inter', sans-serif; box-shadow: 0 14px 40px rgba(0,0,0,.25); animation: resort-note-in .35s ease; }
        @keyframes resort-note-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @media (max-width: 640px) { .resort-floating-note { left: 12px; right: 84px; bottom: 14px; max-width: none; font-size: 12px; } }
        @media (prefers-reduced-motion: reduce) { .resort-floating-note { animation: none; } }
      `}</style>
    </div>
  );
}

export default function ResortAvailabilityNotice() {
  const { available, limited, reason, closedDates = [], error, loading } = useResortAvailability();
  const [modalDismissed, setModalDismissed] = useState(() => readSession(DISMISSED_KEY) === 'true');
  const noteKey = `${limited ? reason : ''}|${closedDates.map(item => `${item.from}:${item.to}:${item.reason}`).join(',')}`;
  const [dismissedNote, setDismissedNote] = useState(() => readSession(NOTE_DISMISSED_KEY));

  useEffect(() => {
    if (!available) return;
    try { window.sessionStorage.removeItem(DISMISSED_KEY); } catch { /* storage unavailable */ }
    setModalDismissed(false);
  }, [available]);

  if (loading) return null;

  if (error) {
    return (
      <FloatingNote tone="red" icon="⚠" title="Booking is temporarily unavailable">
        Resort availability could not be checked. Please try again later.
      </FloatingNote>
    );
  }

  if (!available) {
    const dismiss = () => { writeSession(DISMISSED_KEY, 'true'); setModalDismissed(true); };
    return (
      <>
        <FloatingNote tone="red" icon="⛔" title="Reservations temporarily closed">
          {reason || 'You can continue browsing the resort website.'}
        </FloatingNote>
        {!modalDismissed && (
          <div role="presentation" onClick={dismiss} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(17,24,39,.58)', display: 'grid', placeItems: 'center', padding: 20 }}>
            <section role="dialog" aria-modal="true" aria-labelledby="resort-closed-title" onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16, padding: '30px 26px', boxShadow: '0 24px 80px rgba(0,0,0,.25)', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
              <h2 id="resort-closed-title" style={{ margin: '0 0 10px', color: '#7f1d1d', fontSize: 22 }}>Bookings are temporarily unavailable</h2>
              <p style={{ margin: '0 0 22px', color: '#4b5563', fontSize: 14, lineHeight: 1.7 }}>{reason || 'The resort is currently closed for bookings. Please check back later or contact us for more information.'}</p>
              <button type="button" onClick={dismiss} style={{ border: 0, borderRadius: 8, padding: '11px 20px', background: '#3B4530', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Continue browsing</button>
            </section>
          </div>
        )}
      </>
    );
  }

  // Limited services and/or planned closed dates: bookings stay open.
  if ((!limited && !closedDates.length) || dismissedNote === noteKey) return null;
  const close = () => { writeSession(NOTE_DISMISSED_KEY, noteKey); setDismissedNote(noteKey); };
  return (
    <FloatingNote tone="amber" icon="ℹ" title={closedDates.length ? 'Planned closure' : 'Limited services'} onClose={close}>
      {limited && <div>{reason || 'Some resort areas or services are temporarily unavailable.'}</div>}
      {closedDates.slice(0, 3).map(item => (
        <div key={item.id || item.from}>Closed <strong>{formatClosedRange(item)}</strong>{item.reason ? ` · ${item.reason}` : ''}</div>
      ))}
      <div style={{ marginTop: 2 }}>{closedDates.length ? 'You can still book other dates.' : 'Bookings are still open.'}</div>
    </FloatingNote>
  );
}
