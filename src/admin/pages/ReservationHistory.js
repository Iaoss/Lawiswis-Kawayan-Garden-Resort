import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { SortControls, sortRecords } from '../lib/listSort';
import { Pagination, usePagination } from '../../components/ui/pagination';
import { formatStayDateTime, getStayTimingDetails, toMillis } from '../../lib/stayTimes';
import { getReceiptLineItems } from '../../lib/receiptItems';
import { getReservationRemarks } from '../../lib/reservationRemarks';
import { getBookingChanges } from '../../lib/bookingChanges';
import { BOOKING_OPTIONS, getBookingOptionId } from '../../lib/bookingDetails';
import { paymentReceiptNumber, printBookingReceipt } from '../lib/printBookingReceipt';

const peso = value => `${Number(value) < 0 ? '−' : ''}₱${Math.abs(Number(value || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METHOD_LABELS = { cash: 'Cash', gcash: 'GCash', qrph: 'QR Ph', bank: 'Bank transfer', card: 'Card', online: 'Online', paymaya: 'Maya', grab_pay: 'GrabPay' };

export default function ReservationHistory() {
  const { settings, formatDate } = useSettings();
  const dark = settings?.darkMode;
  const navigate = useNavigate();
  const base = window.location.pathname.startsWith('/receptionist') ? '/receptionist' : '/admin';

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const ACCENT      = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f9fafb';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const HOVER_BG= dark ? '#242422' : '#f9fafb';

  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('booked');
  const [sortDir, setSortDir] = useState('desc');
  // Booking whose details are open, and its payments.
  const [openId, setOpenId] = useState(null);
  const [payments, setPayments] = useState({ id: null, list: [], loading: false, error: '' });
  const opened = reservations.find(r => r.id === openId) || null;

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDocs(collection(db, 'reservations'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReservations(data);
    };
    fetch();
  }, []);

  useEffect(() => {
    if (!openId) return undefined;
    let alive = true;
    setPayments({ id: openId, list: [], loading: true, error: '' });
    getDocs(query(collection(db, 'payments'), where('reservationId', '==', openId)))
      .then(snap => {
        if (!alive) return;
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (toMillis(a.createdAt) || 0) - (toMillis(b.createdAt) || 0));
        setPayments({ id: openId, list, loading: false, error: '' });
      })
      .catch(error => {
        if (alive) setPayments({ id: openId, list: [], loading: false, error: error.message || 'Payments could not be loaded.' });
      });
    const onKey = event => { if (event.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [openId]);

  const term = search.toLowerCase().trim();
  const filtered = sortRecords(reservations.filter(r => {
    const matchSearch = !term ||
      r.guestName?.toLowerCase().includes(term) ||
      r.roomNumber?.includes(search) ||
      r.phone?.includes(search) ||
      r.id.toLowerCase().startsWith(term.replace(/^#/, ''));
    const matchFilter = filter === 'all' || r.status === filter;
    return matchSearch && matchFilter;
  }), sortBy, sortDir);
  const pagination = usePagination(filtered, { pageSize: 25, resetKey: `${search}|${filter}|${sortBy}|${sortDir}` });

  // Badge colors: dark = saturated bg + light text, light = tinted bg + saturated text
  const badge = (kind) => {
    const map = {
      blue:   { dbg: '#1e3a5f', dtext: '#93c5fd', lbg: '#dbeafe', ltext: '#1d4ed8' },
      green:  { dbg: '#14532d', dtext: '#86efac', lbg: '#dcfce7', ltext: '#15803d' },
      gray:   { dbg: '#282827', dtext: '#9ca3af', lbg: '#f3f4f6', ltext: '#4b5563' },
      red:    { dbg: '#7f1d1d', dtext: '#fca5a5', lbg: '#fee2e2', ltext: '#b91c1c' },
      yellow: { dbg: '#78350f', dtext: '#fde68a', lbg: '#fef3c7', ltext: '#b45309' },
      purple: { dbg: '#2d1b4e', dtext: '#c4b5fd', lbg: '#ede9fe', ltext: '#7c3aed' },
    };
    const c = map[kind] || map.gray;
    return dark ? { background: c.dbg, color: c.dtext } : { background: c.lbg, color: c.ltext };
  };

  const statusBadgeKind = (status) => {
    if (status === 'confirmed')    return 'blue';
    if (status === 'checked-in')   return 'green';
    if (status === 'checked-out')  return 'gray';
    if (status === 'cancelled')    return 'red';
    if (status === 'pending')      return 'yellow';
    return 'gray';
  };

  const paymentBadgeKind = (status) => {
    if (status === 'paid')    return 'green';
    if (status === 'partial') return 'yellow';
    return 'red';
  };

  const badgeStyle = { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' };
  const small = { fontSize: '11px', color: MUTED, margin: '2px 0 0' };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: TEXT, marginBottom: '4px' }}>Reservation History</h2>
        <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 18px' }}>Click a booking to see its full details, payments and receipt.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
          <SortControls sortBy={sortBy} sortDir={sortDir} onSortBy={setSortBy} onSortDir={setSortDir}
            style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 10px', fontSize: '12px', fontFamily: "'Poppins', sans-serif", background: CARD2, color: TEXT, outline: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by guest, room, phone or booking #..."
            style={{
              border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 14px',
              fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '288px', maxWidth: '100%',
              background: CARD2, color: TEXT, outline: 'none', boxSizing: 'border-box',
            }} />
          {['all', 'pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{
                padding: '9px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '600',
                textTransform: 'capitalize', cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                border: filter === s ? 'none' : `1px solid ${BORDER}`,
                background: filter === s ? ACCENT : CARD,
                color: filter === s ? ACCENT_TEXT : SUBTEXT,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (filter !== s) e.currentTarget.style.background = HOVER_BG; }}
              onMouseLeave={e => { if (filter !== s) e.currentTarget.style.background = CARD; }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead style={{ background: CARD2 }}>
                <tr>
                  {['Guest', 'Room', 'Type', 'Check-in', 'Check-out', 'Total', 'Payment', 'Status', ''].map(h => (
                    <th key={h || 'open'} style={{ padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: '600', fontSize: '12px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '32px 0', color: MUTED }}>No reservations found.</td></tr>
                ) : (
                  pagination.pageItems.map(r => (
                    <tr key={r.id} tabIndex={0} title="View booking details"
                      onClick={() => setOpenId(r.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(r.id); } }}
                      style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 16px' }}>
                        <p style={{ fontWeight: '600', color: TEXT, margin: 0 }}>{r.guestName}</p>
                        <p style={small}>#{r.id.slice(0, 8).toUpperCase()}{r.phone ? ` · ${r.phone}` : ''}</p>
                      </td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>
                        <p style={{ margin: 0 }}>{r.cottageOnly ? 'Cottage only' : r.type === 'corporate' ? (r.packageName || 'Group package') : `Room ${r.roomNumber || '—'}`}</p>
                        <p style={small}>{r.roomType}</p>
                      </td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                        <span style={{ ...badgeStyle, ...badge('purple') }}>{r.type}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>
                        {formatDate(r.checkIn)}
                        {r.checkedInAt && (() => {
                          const timing = getStayTimingDetails(r).checkIn;
                          return <p style={small}><i className="ti ti-login" aria-hidden="true" /> {formatStayDateTime(r.checkedInAt)}{timing.text ? ` · ${timing.text}` : ''}</p>;
                        })()}
                      </td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>
                        {formatDate(r.checkOut)}
                        {r.checkedOutAt && (() => {
                          const timing = getStayTimingDetails(r);
                          return <p style={small}><i className="ti ti-logout" aria-hidden="true" /> {formatStayDateTime(r.checkedOutAt)}{timing.checkOut.text ? ` · ${timing.checkOut.text}` : ''}{timing.duration ? ` · stayed ${timing.duration}` : ''}</p>;
                        })()}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: TEXT }}>₱{Number(r.totalAmount || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                        <span style={{ ...badgeStyle, ...badge(paymentBadgeKind(r.paymentStatus)) }}>
                          {r.paymentStatus || 'pending'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                        <span style={{ ...badgeStyle, ...badge(statusBadgeKind(r.status)) }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: MUTED }} aria-hidden="true"><i className="ti ti-chevron-right" /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            pagination={pagination}
            itemLabel="reservations"
            colors={{ text: TEXT, muted: MUTED, border: BORDER, background: CARD, accent: ACCENT, accentText: ACCENT_TEXT }}
            style={{ borderTop: `1px solid ${BORDER}` }}
          />
        </div>
      </div>
      {opened && (
        <BookingDetails
          r={opened}
          payments={payments.id === opened.id ? payments : { list: [], loading: true, error: '' }}
          onClose={() => setOpenId(null)}
          onOpenReservations={() => navigate(`${base}/reservations?booking=${encodeURIComponent(opened.id)}`)}
          onOpenBilling={() => navigate(`${base}/billing?booking=${encodeURIComponent(opened.id)}`)}
          formatDate={formatDate}
          t={{ CARD, CARD2, BORDER, TEXT, SUBTEXT, MUTED, ACCENT, ACCENT_TEXT, dark }}
          badge={badge} statusBadgeKind={statusBadgeKind} paymentBadgeKind={paymentBadgeKind} badgeStyle={badgeStyle}
        />
      )}
    </PageLayout>
  );
}

function Line({ t, label, value, strong, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: strong ? '8px 0 4px' : '4px 0', fontSize: 12.5, borderTop: strong ? `1px solid ${t.BORDER}` : 'none', marginTop: strong ? 4 : 0 }}>
      <span style={{ color: t.MUTED }}>{label}</span>
      <span style={{ color: tone || t.TEXT, fontWeight: strong ? 700 : 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// Side panel with everything about one booking: guest, stay, actual
// check-in/out times, charges, payments, cancellation and remarks.
function BookingDetails({ r, payments, onClose, onOpenReservations, onOpenBilling, formatDate, t, badge, statusBadgeKind, paymentBadgeKind, badgeStyle }) {
  const items = getReceiptLineItems(r);
  const paid = Number(r.amountPaid || 0);
  const cancelled = r.status === 'cancelled';
  const balance = cancelled ? 0 : Math.max(0, Math.round((items.grandTotal - paid) * 100) / 100);
  const remarks = getReservationRemarks(r);
  const bookedOn = formatStayDateTime(r.createdAt);
  const option = BOOKING_OPTIONS.find(o => o.id === getBookingOptionId(r));
  const guests = r.type === 'corporate'
    ? `${Number(r.totalGuests || 0)} guests`
    : `${Number(r.adults || 0)} adult(s), ${Number(r.children || 0)} child(ren)`;
  const stay = r.type === 'corporate'
    ? r.packageName || 'Group package'
    : r.cottageOnly ? 'Cottage only (no room)'
      : [r.roomName || `Room ${r.roomNumber || '—'}`, r.roomType].filter(Boolean).join(' · ');

  const section = { background: t.CARD2, border: `1px solid ${t.BORDER}`, borderRadius: 12, padding: '12px 14px' };
  const heading = { fontSize: 11, fontWeight: 700, color: t.SUBTEXT, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' };
  const btn = { border: `1px solid ${t.BORDER}`, background: t.CARD2, color: t.TEXT, borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const green = t.dark ? '#86efac' : '#15803d';
  const red = t.dark ? '#fca5a5' : '#b91c1c';
  const amber = t.dark ? '#fcd34d' : '#b45309';
  const timing = getStayTimingDetails(r);
  const print = () => {
    if (!printBookingReceipt(r, payments.list)) window.alert('Allow pop-ups for this site to print the receipt.');
  };

  return (
    <div role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.48)', display: 'flex', justifyContent: 'flex-end' }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="history-detail-title"
        style={{ width: '100%', maxWidth: 520, height: '100%', overflowY: 'auto', background: t.CARD, borderLeft: `1px solid ${t.BORDER}`, boxShadow: '-12px 0 40px rgba(0,0,0,0.2)', fontFamily: "'Poppins', sans-serif", boxSizing: 'border-box', padding: '20px 20px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h3 id="history-detail-title" style={{ margin: 0, fontSize: 18, color: t.TEXT }}>{r.guestName || 'Guest'}</h3>
            <div style={{ fontSize: 12, color: t.MUTED, marginTop: 2 }}>Booking #{r.id.slice(0, 8).toUpperCase()}{bookedOn ? ` · booked ${bookedOn}` : ''}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ ...badgeStyle, ...badge(statusBadgeKind(r.status)), textTransform: 'capitalize' }}>{String(r.status || 'pending').replace(/-/g, ' ')}</span>
              {!cancelled && <span style={{ ...badgeStyle, ...badge(paymentBadgeKind(r.paymentStatus)), textTransform: 'capitalize' }}>{r.paymentStatus || 'pending'}</span>}
              {r.type && <span style={{ ...badgeStyle, ...badge('purple'), textTransform: 'capitalize' }}>{r.type}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn, padding: '6px 10px' }}><i className="ti ti-x" /></button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <section style={section}>
            <p style={heading}>Guest</p>
            <Line t={t} label="Phone" value={r.phone || 'Not provided'} />
            <Line t={t} label="Email" value={r.email || r.guestEmail || 'Not provided'} />
            {r.preferredContactMethod && <Line t={t} label="Preferred contact" value={r.preferredContactMethod} />}
            {r.companyName && <Line t={t} label="Company" value={r.companyName} />}
          </section>

          <section style={section}>
            <p style={heading}>Stay</p>
            <Line t={t} label="Booked" value={stay} />
            {option && r.type !== 'corporate' && <Line t={t} label="Booking type" value={option.label} />}
            <Line t={t} label="Guests" value={guests} />
            <Line t={t} label="Check-in (booked)" value={[formatDate(r.checkIn), r.checkInTime].filter(Boolean).join(' · ') || '—'} />
            <Line t={t} label="Check-out (booked)" value={[formatDate(r.checkOut), r.checkOutTime].filter(Boolean).join(' · ') || '—'} />
            <Line t={t} label="Checked in at" value={timing.checkIn.actual || 'Not checked in'} tone={r.checkedInAt ? green : t.MUTED} />
            {r.checkInId && <Line t={t} label="ID shown" value={`${r.checkInId.type} ending ${r.checkInId.last4}`} />}
            {timing.checkIn.text && <Line t={t} label="Arrival" value={`${timing.checkIn.text}${timing.checkIn.booked ? ` (booked ${timing.checkIn.booked})` : ''}`} tone={timing.checkIn.tone === 'late' ? amber : green} />}
            <Line t={t} label="Checked out at" value={timing.checkOut.actual || 'Not checked out'} tone={r.checkedOutAt ? t.TEXT : t.MUTED} />
            {timing.checkOut.text && <Line t={t} label="Departure" value={`${timing.checkOut.text}${timing.checkOut.booked ? ` (booked ${timing.checkOut.booked})` : ''}`} tone={timing.checkOut.tone === 'late' ? amber : green} />}
            {timing.duration && <Line t={t} label="Time at the resort" value={timing.duration} />}
            {r.lateCheckoutUntil && <Line t={t} label="Late check-out until" value={formatStayDateTime(r.lateCheckoutUntil)} />}
          </section>

          <section style={section}>
            <p style={heading}>Charges</p>
            {[...items.booking, ...items.extras].map((item, i) => <Line key={i} t={t} label={item.label} value={peso(item.amount)} />)}
            <Line t={t} label="Total (VAT included)" value={peso(items.grandTotal)} strong />
            <Line t={t} label="Net of VAT · 12% VAT" value={`${peso(items.vat.net)} · ${peso(items.vat.vat)}`} />
          </section>

          <section style={section}>
            <p style={heading}>Payments</p>
            {payments.loading && <div style={{ fontSize: 12, color: t.MUTED }}>Loading payments…</div>}
            {payments.error && <div style={{ fontSize: 12, color: red }}>{payments.error}</div>}
            {!payments.loading && !payments.error && payments.list.length === 0 && <div style={{ fontSize: 12, color: t.MUTED }}>No payments recorded.</div>}
            {payments.list.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: `1px dashed ${t.BORDER}`, fontSize: 12.5 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: t.TEXT, fontWeight: 600 }}>{METHOD_LABELS[p.method] || p.method || 'Payment'}{p.provider === 'paymongo' ? ' · online' : ''}</div>
                  <div style={{ fontSize: 11, color: t.MUTED }}>
                    {formatStayDateTime(p.createdAt) || '—'} · {paymentReceiptNumber(p)}
                    {p.officialReceiptNo ? ` · paper receipt ${p.officialReceiptNo}` : ''}
                    {p.recordedByName ? ` · by ${p.recordedByName}` : ''}
                  </div>
                </div>
                <span style={{ color: t.TEXT, fontWeight: 600, whiteSpace: 'nowrap' }}>{peso(p.amount)}</span>
              </div>
            ))}
            <Line t={t} label="Total paid" value={peso(paid)} strong />
            {!cancelled && <Line t={t} label="Balance" value={peso(balance)} tone={balance > 0 ? red : green} />}
          </section>

          {cancelled && (
            <section style={{ ...section, borderColor: t.dark ? '#7f1d1d' : '#fecaca' }}>
              <p style={{ ...heading, color: red }}>Cancellation</p>
              <Line t={t} label="Cancelled on" value={formatStayDateTime(r.cancelledAt) || '—'} />
              {r.cancelledByName && <Line t={t} label="Cancelled by" value={r.cancelledByName} />}
              {r.cancellationTier && <Line t={t} label="Policy" value={r.cancellationTier} />}
              <Line t={t} label={`Cancellation fee${r.cancellationFeeRate !== undefined ? ` (${r.cancellationFeeRate}%)` : ''}`} value={peso(r.cancellationFee)} />
              <Line t={t} label="Refund to the guest" value={peso(r.refundAmount)} strong tone={green} />
              <Line t={t} label="Reason" value={r.cancellationReason || 'No reason recorded'} />
              {r.cancellationReceiptNumber && <Line t={t} label="Cancellation receipt" value={`${r.cancellationReceiptNumber}${r.cancellationEmailSentAt ? ' · emailed' : ''}`} />}
            </section>
          )}

          {(() => {
            const changes = getBookingChanges(r);
            if (!changes.length) return null;
            return (
              <section style={section}>
                <p style={heading}>Changes ({changes.length})</p>
                {changes.map(change => (
                  <div key={change.key} style={{ padding: '6px 0', borderTop: `1px solid ${t.BORDER}`, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong style={{ color: t.TEXT }}>{change.title}</strong>
                      <span style={{ color: t.MUTED, whiteSpace: 'nowrap' }}>{change.at ? formatStayDateTime(change.at) : ''}</span>
                    </div>
                    <div style={{ color: t.SUBTEXT }}>{change.text}{change.by ? ` · by ${change.by}` : ''}</div>
                  </div>
                ))}
              </section>
            );
          })()}

          {remarks.length > 0 && (
            <section style={section}>
              <p style={heading}>Remarks</p>
              {remarks.map(item => (
                <div key={item.type} style={{ fontSize: 12, color: t.TEXT, padding: '3px 0' }}>
                  <strong style={{ color: item.tone === 'red' ? red : item.tone === 'green' ? green : '#b45309' }}>{item.label}:</strong> {item.text}
                </div>
              ))}
            </section>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" onClick={print} style={{ ...btn, background: t.ACCENT, color: t.ACCENT_TEXT, border: 'none' }}>
            <i className="ti ti-printer" style={{ marginRight: 6 }} />Print receipt
          </button>
          <button type="button" onClick={onOpenReservations} style={btn}>Open in Reservations</button>
          {!cancelled && <button type="button" onClick={onOpenBilling} style={btn}>Open billing</button>}
        </div>
      </aside>
    </div>
  );
}
