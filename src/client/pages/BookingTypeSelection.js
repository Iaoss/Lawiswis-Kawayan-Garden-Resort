import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RESERVATION_DEPOSIT_PERCENTAGE } from '../../lib/paymentPolicy';
import { BRASS, FOREST, FOREST_DEEP, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';
import { openBookingTypeModal } from '../lib/bookingTypeModal';

export function BookingTypeSelectionModal({ open, onClose, onSelectPersonal, onSelectCorporate }) {
  if (!open) return null;

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(19, 29, 17, 0.72)', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="booking-type-title" onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: '820px', background: '#fff', border: `1px solid ${LINE}`, padding: 'clamp(26px, 6vw, 56px)', boxShadow: '0 24px 70px rgba(35,42,27,.22)', position: 'relative' }}>
        <button type="button" onClick={onClose} aria-label="Close booking options" style={{ position: 'absolute', top: '14px', right: '14px', border: `1px solid ${LINE}`, background: PAPER, color: FOREST_DEEP, width: '34px', height: '34px', borderRadius: '999px', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>
          ×
        </button>
        <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '12px' }}>Choose your experience</div>
        <h1 id="booking-type-title" style={{ color: FOREST_DEEP, font: `500 clamp(34px, 5vw, 48px)/1.1 ${SERIF}`, margin: '0 0 12px' }}>How many guests are joining?</h1>
        <p style={{ color: '#6b6a5c', font: `14px/1.7 ${SANS}`, margin: '0 0 30px' }}>Choose the booking path that fits your group. Groups of 15 or more are priced per guest in our corporate package tiers.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: '14px' }}>
          <button type="button" onClick={onSelectPersonal} style={{ textAlign: 'left', border: `1px solid ${LINE}`, background: PAPER, padding: '23px', cursor: 'pointer', color: FOREST_DEEP, fontFamily: SANS }}>
            <span style={{ display: 'block', color: FOREST, font: `600 11px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Personal Booking</span>
            <strong style={{ display: 'block', font: `500 25px ${SERIF}`, marginBottom: '8px' }}>1–14 guests</strong>
            <span style={{ color: '#6b6a5c', font: `13px/1.6 ${SANS}` }}>Browse individual rooms and continue with the standard reservation workflow.</span>
          </button>
          <button type="button" onClick={onSelectCorporate} style={{ textAlign: 'left', border: `1px solid ${FOREST}`, background: FOREST, padding: '23px', cursor: 'pointer', color: '#fff', fontFamily: SANS }}>
            <span style={{ display: 'block', color: '#e4d4a7', font: `600 11px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Corporate / Big Group Booking</span>
            <strong style={{ display: 'block', font: `500 25px ${SERIF}`, marginBottom: '8px' }}>15+ guests</strong>
            <span style={{ color: 'rgba(255,255,255,.78)', font: `13px/1.6 ${SANS}` }}>Compare Bamboo packages, group inclusions, and the per-person total.</span>
          </button>
        </div>
        <div style={{ marginTop: '22px', color: '#777363', font: `11px/1.6 ${SANS}` }}>A {RESERVATION_DEPOSIT_PERCENTAGE}% deposit is required for new reservations. The remaining balance is due before checkout.</div>
      </section>
    </div>
  );
}

export default function BookingTypeSelection() {
  const navigate = useNavigate();

  useEffect(() => {
    openBookingTypeModal();
    navigate('/home', { replace: true });
  }, [navigate]);

  return null;
}
