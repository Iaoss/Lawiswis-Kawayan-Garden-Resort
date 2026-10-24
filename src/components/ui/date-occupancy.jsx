import React, { useEffect, useState } from 'react';

const SLOTS = [
  { id: 'day', label: 'Day tour', hours: '8 AM–5 PM' },
  { id: 'night', label: 'Night tour', hours: '5 PM–10 PM' },
  { id: 'overnight', label: 'Overnight', hours: 'that night' },
];

const DEFAULT_COLORS = {
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#f9fafb',
  accent: '#1a3a1a',
};

const formatDay = date => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

// Live count of bookings and guests already on `date`, per time slot.
// `focus` ('day' | 'night' | 'overnight') highlights the slot being booked.
// Refreshes every `refreshMs` while shown, and when the tab regains focus.
export default function DateOccupancy({ date, focus = '', refreshMs = 30000, colors, style }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const c = { ...DEFAULT_COLORS, ...colors };

  useEffect(() => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setData(null);
      return undefined;
    }
    let active = true;
    const load = () => fetch(`/api/occupancy?date=${encodeURIComponent(date)}`)
      .then(response => {
        if (!response.ok) throw new Error('Occupancy unavailable');
        return response.json();
      })
      .then(json => { if (active) { setData(json); setError(false); } })
      .catch(() => { if (active) setError(true); });
    setData(null);
    load();
    const timer = setInterval(load, refreshMs);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [date, refreshMs]);

  if (!date) return null;

  return (
    <div role="status" aria-live="polite"
      style={{ border: `1px solid ${c.border}`, background: c.background, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: c.text, ...style }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Already booked on {formatDay(date)}
        <span style={{ fontWeight: 400, color: c.muted }}> · updates live</span>
      </div>
      {error && !data ? (
        <div style={{ color: c.muted }}>Booking counts couldn’t be loaded right now.</div>
      ) : !data ? (
        <div style={{ color: c.muted }}>Checking…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          {SLOTS.map(slot => {
            const counts = data[slot.id] || { bookings: 0, guests: 0 };
            const highlighted = slot.id === focus;
            return (
              <div key={slot.id}
                style={{ borderRadius: 8, padding: '6px 8px', border: `1px solid ${highlighted ? c.accent : c.border}`, background: highlighted ? `${c.accent}14` : 'transparent' }}>
                <div style={{ fontWeight: 600 }}>{slot.label} <span style={{ fontWeight: 400, color: c.muted }}>{slot.hours}</span></div>
                <div style={{ color: highlighted ? c.text : c.muted }}>
                  {counts.bookings} booking{counts.bookings === 1 ? '' : 's'} · {counts.guests} guest{counts.guests === 1 ? '' : 's'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
