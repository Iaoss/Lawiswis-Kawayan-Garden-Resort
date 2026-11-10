import React from 'react';
import { BRASS, FOREST, FOREST_DEEP, LINE, SANS } from './clientTheme';

// Progress bar for the booking flow, shared by the step-by-step booking
// page (/book) and the room booking page (/book/:roomId).
export const BOOKING_STEPS = ['Type', 'When', 'Room', 'Stay details', 'Your details', 'Review & pay'];

export default function BookingSteps({ current, onStep, style }) {
  return (
    <nav aria-label="Booking steps" style={{ marginBottom: 24, ...style }}>
      <style>{`
        .booking-steps { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0; overflow-x: auto; scrollbar-width: none; }
        .booking-steps::-webkit-scrollbar { display: none; }
        .booking-steps li { flex: 1 0 auto; min-width: 72px; }
        @media (max-width: 640px) { .booking-steps .booking-step-label { display: none; } .booking-steps li.is-current .booking-step-label { display: inline; } }
      `}</style>
      <ol className="booking-steps">
        {BOOKING_STEPS.map((label, index) => {
          const done = index < current;
          const active = index === current;
          const clickable = done && typeof onStep === 'function';
          return (
            <li key={label} className={active ? 'is-current' : ''}>
              <button type="button" disabled={!clickable} onClick={() => clickable && onStep(index)} aria-current={active ? 'step' : undefined}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, border: 0, background: 'none', padding: '0 0 8px', cursor: clickable ? 'pointer' : 'default', borderBottom: `3px solid ${active ? BRASS : done ? FOREST : LINE}`, textAlign: 'left', fontFamily: SANS }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', font: `700 11px ${SANS}`, background: active ? BRASS : done ? FOREST : '#fff', color: active || done ? '#fff' : '#8d8877', border: `1px solid ${active ? BRASS : done ? FOREST : LINE}` }}>
                  {done ? '✓' : index + 1}
                </span>
                <span className="booking-step-label" style={{ font: `${active ? 700 : 500} 12px ${SANS}`, color: active ? FOREST_DEEP : done ? FOREST : '#8d8877', whiteSpace: 'nowrap' }}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
