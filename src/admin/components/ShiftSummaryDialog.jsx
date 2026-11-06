import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { getOutstandingBalance, getOverstay } from '../../lib/reservationStatus';
import { getShiftStart, signOutTo } from '../lib/staffSession';
import { logStaffActivity } from '../lib/activityLog';
import { money } from '../lib/money';

// End-of-shift summary, shown when staff sign out: what they collected (by
// payment method), guests still owing money, open requests and overstays,
// so the next shift knows. Confirming saves it in the Activity Log.

const peso = value => money(value);
const METHOD_LABELS = { cash: 'Cash', gcash: 'GCash', qrph: 'QR Ph', bank: 'Bank transfer', card: 'Card', online: 'Online', paymaya: 'Maya', grab_pay: 'GrabPay' };

export default function ShiftSummaryDialog({ open, onClose, staffName = '', dark, accent }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const uid = auth.currentUser?.uid || '';
  const shiftStart = useMemo(() => getShiftStart(uid), [uid, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError('');
    Promise.all([
      getDocs(query(collection(db, 'payments'), where('createdAt', '>=', Timestamp.fromMillis(shiftStart)))),
      getDocs(query(collection(db, 'reservations'), where('status', 'in', ['checked-in', 'confirmed', 'pending']))),
    ]).then(([paymentSnap, reservationSnap]) => {
      const mine = paymentSnap.docs.map(d => d.data()).filter(p => p.recordedBy === uid);
      const byMethod = {};
      mine.forEach(p => { const key = String(p.method || 'other').toLowerCase(); byMethod[key] = (byMethod[key] || 0) + Number(p.amount || 0); });
      const reservations = reservationSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const inHouse = reservations.filter(r => r.status === 'checked-in');
      setData({
        payments: mine.length,
        collected: mine.reduce((sum, p) => sum + Number(p.amount || 0), 0),
        byMethod,
        owing: inHouse.filter(r => getOutstandingBalance(r) > 0.004)
          .map(r => ({ id: r.id, guest: r.guestName || 'Guest', room: r.roomNumber || r.roomName || '—', owed: getOutstandingBalance(r) })),
        overstays: inHouse.filter(r => getOverstay(r)).map(r => r.guestName || 'Guest'),
        requests: reservations.filter(r => r.cancellationRequested
          || ['eligible', 'needs_review'].includes(String(r.refundRequestStatus || ''))
          || ['requested', 'needs_review'].includes(String(r.modificationRequest?.status || ''))).length,
        inHouse: inHouse.length,
      });
    }).catch(loadError => setError(loadError.message || 'The summary could not be loaded.'));
  }, [open, shiftStart, uid]);

  if (!open) return null;

  const summaryText = data
    ? `Shift handover: collected ${peso(data.collected)} in ${data.payments} payment(s)${Object.keys(data.byMethod).length ? ` (${Object.entries(data.byMethod).map(([m, v]) => `${METHOD_LABELS[m] || m} ${peso(v)}`).join(', ')})` : ''}; ${data.owing.length} guest(s) still owe ${peso(data.owing.reduce((s, r) => s + r.owed, 0))}; ${data.requests} open request(s); ${data.overstays.length} overstay(s).${note.trim() ? ` Note: ${note.trim()}` : ''}`
    : '';
  const base = window.location.pathname.startsWith('/receptionist') ? '/receptionist' : '/admin';

  const finish = async () => {
    setBusy(true);
    try {
      if (data) await logStaffActivity('shift_handover', summaryText.slice(0, 300));
    } finally {
      await signOutTo(`/admin/login`);
    }
  };

  const c = {
    card: dark ? '#1c1c1c' : '#fff', card2: dark ? '#262624' : '#f7f8f7', border: dark ? '#2f2f2c' : '#e5e7eb',
    text: dark ? '#f0f0f0' : '#111827', muted: dark ? '#a3a39a' : '#6b7280',
  };
  const row = (label, value, strong) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '3px 0', fontWeight: strong ? 700 : 400 }}>
      <span style={{ color: strong ? c.text : c.muted }}>{label}</span><span>{value}</span>
    </div>
  );

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-label="End of shift"
        style={{ width: '100%', maxWidth: 460, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20, fontFamily: "'Poppins', sans-serif", display: 'grid', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>End of shift</h3>
          <div style={{ fontSize: 12, color: c.muted }}>{staffName} · since {new Date(shiftStart).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        {error && <div role="alert" style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
        {!data && !error && <div style={{ fontSize: 12, color: c.muted }}>Adding up your shift…</div>}
        {data && (
          <>
            <div style={{ background: c.card2, borderRadius: 10, padding: '10px 12px' }}>
              {row('You collected', `${peso(data.collected)} · ${data.payments} payment${data.payments === 1 ? '' : 's'}`, true)}
              {Object.entries(data.byMethod).map(([method, value]) => row(METHOD_LABELS[method] || method, peso(value)))}
              {data.payments > 0 && <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>Check that the cash drawer matches the cash total.</div>}
            </div>
            <div style={{ background: c.card2, borderRadius: 10, padding: '10px 12px' }}>
              {row('Guests in house', data.inHouse)}
              {row('Still owing money', data.owing.length ? `${data.owing.length} · ${peso(data.owing.reduce((s, r) => s + r.owed, 0))}` : 'None')}
              {data.owing.slice(0, 6).map(r => <div key={r.id} style={{ fontSize: 12, color: c.muted }}>· {r.guest} (Room {r.room}): {peso(r.owed)}</div>)}
              {row('Open requests (cancel / refund / date change)', data.requests || 'None')}
              {row('Past check-out time', data.overstays.length ? data.overstays.join(', ') : 'None')}
            </div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: c.muted }}>Note for the next shift (optional)
              <textarea value={note} maxLength={150} rows={2} onChange={e => setNote(e.target.value)} placeholder="e.g. Room 12 guest will pay balance at 8 AM"
                style={{ background: c.card2, border: `1px solid ${c.border}`, borderRadius: 9, padding: 9, color: c.text, font: 'inherit', fontSize: 13, resize: 'vertical' }} />
            </label>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <a href={`${base}/reservations`} onClick={onClose} style={{ fontSize: 12, color: c.muted, alignSelf: 'center' }}>Review bookings first</a>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={onClose} style={{ border: `1px solid ${c.border}`, background: c.card2, color: c.text, borderRadius: 9, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Stay signed in</button>
            <button type="button" disabled={busy} onClick={finish} style={{ border: 'none', background: accent || '#9cb56f', color: '#0a1a0a', borderRadius: 9, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {busy ? 'Signing out…' : data ? 'Save handover & sign out' : 'Sign out'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
