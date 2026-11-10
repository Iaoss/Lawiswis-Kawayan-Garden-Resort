import React, { useMemo, useState } from 'react';
import { stayRangesOverlap } from '../../lib/bookingPricing';
import { staffApi } from '../lib/staffApi';
import { appConfirm } from '../../components/ui/app-dialog';

// Admin tool for when the resort must close (typhoon, flood, emergency):
// pick the closed dates, see every affected booking, email the guests their
// options (new dates or a full refund, no fee), then cancel with a full
// refund or open the booking to move its dates. The cancellation and
// date-change rules are waived only for these, with the reason saved.

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`;
const endOf = r => String(r.checkOut || r.checkIn || '').slice(0, 10);

export default function ResortClosurePanel({ reservations = [], colors, onChanged }) {
  const c = colors;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const affected = useMemo(() => {
    if (!from || !to || to < from) return [];
    return reservations
      .filter(r => ['pending', 'confirmed'].includes(r.status) && r.checkIn
        && stayRangesOverlap(from, to, String(r.checkIn).slice(0, 10), endOf(r)))
      .sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
  }, [reservations, from, to]);

  const ready = from && to && to >= from && reason.trim().length >= 3;

  const sendNotices = async () => {
    const withEmail = affected.filter(r => r.email || r.guestEmail);
    const ok = await appConfirm(`Email ${withEmail.length} guest${withEmail.length === 1 ? '' : 's'} that the resort is closed on their dates, with the choice of new dates or a full refund (no fee)?`, {
      title: 'Send closure notices?', confirmLabel: 'Send emails',
    });
    if (!ok) return;
    setBusy('notices');
    setMessage(null);
    try {
      const result = await staffApi('staff-billing', { action: 'closure-notice', reservationIds: withEmail.map(r => r.id), closedFrom: from, closedTo: to, reason: reason.trim() });
      setMessage({ type: 'success', text: `Closure notice emailed to ${result.sent} guest${result.sent === 1 ? '' : 's'}.${result.failed?.length ? ` ${result.failed.length} could not be sent.` : ''}` });
      onChanged?.();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'The notices could not be sent.' });
    } finally {
      setBusy('');
    }
  };

  const refundInFull = async r => {
    const ok = await appConfirm(`Cancel ${r.guestName || 'this booking'} with no fee and a full refund of ${peso(r.amountPaid)}?`, {
      title: 'Cancel with a full refund?', tone: 'warning', confirmLabel: 'Cancel and refund',
    });
    if (!ok) return;
    setBusy(r.id);
    setMessage(null);
    try {
      const result = await staffApi('staff-billing', { action: 'cancel-with-policy', reservationId: r.id, waive: true, reason: `Resort closed: ${reason.trim()}` });
      setMessage({ type: 'success', text: `${r.guestName || 'Booking'} cancelled. Refund ${peso(result.refund)}.${result.emailSent ? ' Receipt emailed.' : ''}` });
      onChanged?.();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'The booking could not be cancelled.' });
    } finally {
      setBusy('');
    }
  };

  const base = window.location.pathname.startsWith('/receptionist') ? '/receptionist' : '/admin';
  const input = { background: c.CARD2, border: `1px solid ${c.BORDER}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, color: c.TEXT, fontFamily: 'inherit' };
  const btn = { border: `1px solid ${c.BORDER}`, background: c.CARD2, color: c.TEXT, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <section style={{ background: c.CARD, border: `1px solid ${c.BORDER}`, borderRadius: 16, padding: 20, marginTop: 20 }}>
      <h3 style={{ margin: 0, fontSize: 16, color: c.TEXT, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="ti ti-cloud-storm" aria-hidden="true" /> Resort closure (typhoon, flood, emergency)
      </h3>
      <p style={{ margin: '6px 0 14px', fontSize: 12.5, color: c.SUBTEXT, lineHeight: 1.6 }}>
        Find every booking on the closed dates, email the guests their options (new dates or a full refund, with no fee), then refund or move each booking.
        The cancellation fee and the date-change rule are waived only for these, and every step is saved in the Activity Log.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: c.SUBTEXT, fontWeight: 600 }}>Closed from
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: c.SUBTEXT, fontWeight: 600 }}>Closed to
          <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: c.SUBTEXT, fontWeight: 600, flex: '1 1 220px' }}>Reason (shown to guests)
          <input value={reason} maxLength={120} onChange={e => setReason(e.target.value)} placeholder="e.g. Typhoon Kristine" style={input} />
        </label>
      </div>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} style={{ marginTop: 12, fontSize: 12.5, padding: '9px 12px', borderRadius: 9, background: message.type === 'error' ? (c.dark ? '#7f1d1d' : '#fee2e2') : (c.dark ? '#14532d' : '#dcfce7'), color: message.type === 'error' ? (c.dark ? '#fca5a5' : '#b91c1c') : (c.dark ? '#86efac' : '#15803d') }}>
          {message.text}
        </div>
      )}

      {from && to && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: c.TEXT }}>{affected.length} affected booking{affected.length === 1 ? '' : 's'}</strong>
            <button type="button" disabled={!ready || !affected.length || busy === 'notices'} onClick={sendNotices}
              title={!ready ? 'Choose the dates and write a reason first' : undefined}
              style={{ ...btn, background: c.ACCENT, color: c.ACCENT_TEXT, border: 'none', opacity: !ready || !affected.length ? 0.6 : 1 }}>
              {busy === 'notices' ? 'Sending…' : 'Email all affected guests'}
            </button>
          </div>
          {affected.length === 0 ? (
            <p style={{ fontSize: 12, color: c.SUBTEXT, margin: 0 }}>No active bookings on these dates.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {affected.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: c.CARD2, border: `1px solid ${c.BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.TEXT }}>{r.guestName || 'Guest'} · #{r.id.slice(0, 8).toUpperCase()}</div>
                    <div style={{ fontSize: 11.5, color: c.SUBTEXT }}>
                      {r.checkIn}{endOf(r) !== r.checkIn ? ` → ${endOf(r)}` : ''} · {r.roomName || (r.roomNumber ? `Room ${r.roomNumber}` : r.packageName || 'Booking')} · paid {peso(r.amountPaid)}
                      {!(r.email || r.guestEmail) && ' · no email (call the guest)'}
                      {r.closureNotice?.sentAt && ' · notice sent'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <a href={`${base}/reservations?booking=${encodeURIComponent(r.id)}`} style={{ ...btn, textDecoration: 'none' }}>Move dates</a>
                    <button type="button" disabled={!ready || busy === r.id} onClick={() => refundInFull(r)}
                      title={!ready ? 'Write the reason first' : undefined}
                      style={{ ...btn, color: c.dark ? '#fca5a5' : '#b91c1c', opacity: !ready ? 0.6 : 1 }}>
                      {busy === r.id ? 'Cancelling…' : 'Cancel · full refund'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: c.SUBTEXT, margin: '10px 0 0' }}>
            "Move dates" opens the booking: choose Edit, then tick "Waive the date-change rule". Refunds for online payments are given back as usual after cancelling.
          </p>
        </div>
      )}
    </section>
  );
}
