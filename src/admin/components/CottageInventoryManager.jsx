import React, { useEffect, useState } from 'react';
import { auth } from '../../firebase/firebase';
import { COTTAGE_OPTIONS, cottageName } from '../../lib/bookingPricing';

// Admin: how many of each cottage the resort has. Bookings (online,
// cottage-only tours and walk-ins) are blocked once they're all taken for a
// date and tour time. An empty box means "not limited".
const COTTAGES = COTTAGE_OPTIONS.filter(option => option.id);

export default function CottageInventoryManager({ t }) {
  const [counts, setCounts] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/api/cottage-availability')
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('load failed'))))
      .then(result => setCounts(Object.fromEntries(COTTAGES.map(c => [c.id, result.inventory?.[c.id] ?? '']))))
      .catch(() => { setCounts(Object.fromEntries(COTTAGES.map(c => [c.id, '']))); setMessage({ type: 'error', text: 'The current cottage counts could not be loaded.' }); });
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/cottage-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(counts),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The cottage counts could not be saved.');
      setMessage({ type: 'ok', text: 'Cottage counts saved.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${t.BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, background: t.CARD2, color: t.TEXT, outline: 'none' };

  return (
    <div style={{ borderTop: `1px solid ${t.BORDER}`, paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.TEXT }}>Cottages</div>
      <div style={{ fontSize: 12, color: t.SUBTEXT, margin: '3px 0 12px' }}>
        How many of each cottage the resort has. Once they're all booked for a date and tour time, guests and staff can't book more. Leave a box empty for no limit.
      </div>
      {!counts ? <div style={{ color: t.MUTED, fontSize: 12 }}>Loading…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {COTTAGES.map(cottage => (
              <label key={cottage.id} style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 600, color: t.SUBTEXT }}>
                {cottageName(cottage)} (up to {cottage.maxGuests} guests)
                <input type="number" min="0" max="100" step="1" placeholder="No limit" value={counts[cottage.id]}
                  onChange={e => { setCounts(c => ({ ...c, [cottage.id]: e.target.value })); setMessage(null); }} style={input} />
              </label>
            ))}
          </div>
          {message && <div role={message.type === 'error' ? 'alert' : 'status'} style={{ color: message.type === 'error' ? '#b91c1c' : '#15803d', fontSize: 12, marginTop: 10 }}>{message.text}</div>}
          <button type="button" onClick={save} disabled={saving}
            style={{ margin: '12px 0 16px', padding: '9px 16px', border: 0, borderRadius: 9, background: t.ACCENT, color: t.ACCENT_TEXT, fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.65 : 1 }}>
            {saving ? 'Saving…' : 'Save cottage counts'}
          </button>
        </>
      )}
    </div>
  );
}
