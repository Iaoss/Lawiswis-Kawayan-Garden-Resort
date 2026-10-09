import React, { useEffect, useState } from 'react';
import { useResortAvailability } from './ResortAvailabilityContext';

const DISMISSED_KEY = 'lkgr_unavailable_notice_dismissed';

export default function ResortAvailabilityNotice() {
  const { available, reason, error, loading } = useResortAvailability();
  const [modalDismissed, setModalDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISSED_KEY) === 'true';
    } catch (error) {
      console.error('Unable to read closure notice preference:', error);
      return false;
    }
  });

  useEffect(() => {
    if (!available) return;
    try {
      window.sessionStorage.removeItem(DISMISSED_KEY);
      setModalDismissed(false);
    } catch (error) {
      console.error('Unable to reset closure notice preference:', error);
    }
  }, [available]);

  if (loading) return null;

  if (error) {
    return (
      <div role="alert" style={{ background: '#7f1d1d', color: '#fff', padding: '11px 18px', textAlign: 'center', fontSize: 13, lineHeight: 1.5 }}>
        Resort availability could not be checked. Booking is temporarily disabled. Please try again later.
      </div>
    );
  }

  if (available) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch (error) {
      console.error('Unable to save closure notice preference:', error);
    }
    setModalDismissed(true);
  };

  return (
    <>
      <div role="status" style={{ background: '#7f1d1d', color: '#fff', padding: '11px 18px', textAlign: 'center', fontSize: 13, lineHeight: 1.5 }}>
        <strong>Reservations temporarily closed.</strong>{reason ? ` ${reason}` : ' You can continue browsing the resort website.'}
      </div>
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
