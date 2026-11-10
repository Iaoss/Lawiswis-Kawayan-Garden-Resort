import React, { useState } from 'react';
import { checkChatAvailability } from '../lib/chatAutoAnswer';
import { MAX_CHAT_GUESTS, addDaysKey, bookingWindow, normalizeAvailabilityRequest } from '../../lib/chatAvailability';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';

// "Check availability" in the guest chat: pick dates and guests, and the bot
// answers in the chat with the free rooms and prices.
export default function ChatAvailability({ convId, onError }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ checkIn: '', checkOut: '', guests: '2' });
  const { today, maxDate } = bookingWindow();

  const set = (key, value) => {
    setError('');
    setForm(current => {
      const next = { ...current, [key]: value };
      if (key === 'checkIn' && value && (!next.checkOut || next.checkOut <= value)) next.checkOut = addDaysKey(value, 1);
      return next;
    });
  };

  const submit = async event => {
    event.preventDefault();
    const request = normalizeAvailabilityRequest({ ...form, guests: Number(form.guests) });
    if (request.error) { setError(request.error); return; }
    setBusy(true);
    onError?.('');
    try {
      await checkChatAvailability(convId, request);
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Availability could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  const field = { width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 9px', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#111' };
  const label = { display: 'grid', gap: 3, minWidth: 0, fontSize: 10, fontWeight: 600, color: '#6b7280' };

  return (
    <div style={{ padding: '8px 14px 0', background: '#fff', borderTop: '1px solid #e5e7eb' }}>
      <button type="button" onClick={() => { setOpen(v => !v); setError(''); }} disabled={!convId} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: open ? DARK : '#eff6f0', color: open ? '#d4f550' : DARK, border: `1px solid ${ACCENT}55`, borderRadius: 12, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: convId ? 'pointer' : 'wait', fontFamily: "'Poppins', sans-serif" }}>
        <i className="ti ti-calendar-search" aria-hidden="true" style={{ fontSize: 16 }} />
        {open ? 'Close' : 'Check availability'}
      </button>
      {open && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.7fr)', gap: 6 }}>
            <label style={label}>Check-in
              <input type="date" required min={today} max={maxDate} value={form.checkIn} onChange={e => set('checkIn', e.target.value)} style={field} />
            </label>
            <label style={label}>Check-out
              <input type="date" required min={form.checkIn ? addDaysKey(form.checkIn, 1) : addDaysKey(today, 1)} max={maxDate} value={form.checkOut} onChange={e => set('checkOut', e.target.value)} style={field} />
            </label>
            <label style={label}>Guests
              <input type="number" required min="1" max={MAX_CHAT_GUESTS} inputMode="numeric" value={form.guests} onChange={e => set('guests', e.target.value.replace(/\D/g, '').slice(0, 2))} style={field} />
            </label>
          </div>
          {error && <div role="alert" style={{ fontSize: 11, color: '#b91c1c' }}>{error}</div>}
          <button type="submit" disabled={busy}
            style={{ background: DARK, color: '#d4f550', border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            {busy ? 'Checking…' : 'See free rooms'}
          </button>
        </form>
      )}
    </div>
  );
}
