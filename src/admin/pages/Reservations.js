import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase/firebase';
import { collection, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

export default function Reservations() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const BG       = dark ? '#020b09' : '#f4f6f4';
  const CARD     = dark ? '#1c1c1c' : '#ffffff';
  const CARD2    = dark ? '#282827' : '#f4f6f4';
  const BORDER   = dark ? '#2a2a28' : '#e5e7eb';
  const BORDER2  = dark ? '#3a3a38' : '#e5e7eb';
  const ROWLINE  = dark ? '#242422' : '#f3f4f6';
  const TEXT     = dark ? '#f0f0f0' : '#111827';
  const MUTED    = dark ? '#9ca3af' : '#6b7280';
  const ACCENT   = settings?.accentColor || '#c8f06e';
  const ACCENT_TEXT = '#0a1a0a';

  // ── Role detection (based on route; swap for real auth/role context if available) ──
  const isReceptionist = window.location.pathname.startsWith('/receptionist');
  const isAdmin = !isReceptionist;

  const [reservations, setReservations] = useState([]);
  const [filter, setFilter]             = useState('all');
  const [search, setSearch]             = useState('');
  const [page,   setPage]               = useState(1);
  const perPage = 10;

  const fetchReservations = async () => {
    const snap = await getDocs(collection(db, 'reservations'));
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setReservations(data);
  };

  useEffect(() => { fetchReservations(); }, []);

  const updateStatus = async (id, status) => {
    const reservation = reservations.find(r => r.id === id);
    await updateDoc(doc(db, 'reservations', id), { status });

    if (reservation?.roomId) {
      try {
        if (status === 'checked-in') {
          await updateDoc(doc(db, 'rooms', reservation.roomId), { status: 'occupied' });
        } else if (status === 'checked-out' || status === 'cancelled') {
          await updateDoc(doc(db, 'rooms', reservation.roomId), { status: 'vacant' });
        }
      } catch (roomErr) {
        console.warn('Room status update skipped:', roomErr.message);
      }
    }
    fetchReservations();
  };

  // ── Cancellation request flow (receptionist requests, admin approves/denies) ──
  const requestCancellation = async (id, reason) => {
    await updateDoc(doc(db, 'reservations', id), {
      cancellationRequested: true,
      cancellationRequestedBy: auth.currentUser?.uid || null,
      cancellationRequestedAt: serverTimestamp(),
      cancellationReason: reason || '',
    });
    fetchReservations();
  };

  const approveCancellation = async (reservation) => {
    await updateDoc(doc(db, 'reservations', reservation.id), {
      status: 'cancelled',
      cancellationRequested: false,
    });
    if (reservation.roomId) {
      try {
        await updateDoc(doc(db, 'rooms', reservation.roomId), { status: 'vacant' });
      } catch (err) {
        console.warn('Room status update skipped:', err.message);
      }
    }
    fetchReservations();
  };

  const denyCancellation = async (id) => {
    await updateDoc(doc(db, 'reservations', id), { cancellationRequested: false });
    fetchReservations();
  };

  // Badges: dark, saturated bg + light text in dark mode; light, tinted bg + dark saturated text in light mode
  const statusBadge = (status) => {
    const map = {
      confirmed:     { dbg: '#14532d', dtext: '#86efac', lbg: '#dcfce7', ltext: '#15803d' },
      'checked-in':  { dbg: '#1e3a5f', dtext: '#93c5fd', lbg: '#dbeafe', ltext: '#1d4ed8' },
      'checked-out': { dbg: '#282827', dtext: '#9ca3af', lbg: '#f3f4f6', ltext: '#4b5563' },
      cancelled:     { dbg: '#7f1d1d', dtext: '#fca5a5', lbg: '#fee2e2', ltext: '#b91c1c' },
      pending:       { dbg: '#78350f', dtext: '#fde68a', lbg: '#fef3c7', ltext: '#b45309' },
    };
    const c = map[status] || { dbg: '#282827', dtext: '#9ca3af', lbg: '#f3f4f6', ltext: '#4b5563' };
    return dark ? { bg: c.dbg, color: c.dtext } : { bg: c.lbg, color: c.ltext };
  };

  const typeBadge = dark
    ? { bg: '#2d1b4e', color: '#c4b5fd' }
    : { bg: '#ede9fe', color: '#7c3aed' };

  const nights = (r) => {
    if (!r.checkIn || !r.checkOut) return '—';
    const n = Math.ceil((new Date(r.checkOut) - new Date(r.checkIn)) / (1000 * 60 * 60 * 24));
    return `${n} night${n !== 1 ? 's' : ''}`;
  };

  const filtered = reservations.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter;
    const matchSearch =
      r.guestName?.toLowerCase().includes(search.toLowerCase()) ||
      r.roomNumber?.includes(search) ||
      r.status?.includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged      = filtered.slice((page - 1) * perPage, page * perPage);

  const inp = {
    background: CARD2, border: `1px solid ${BORDER2}`,
    borderRadius: '10px', padding: '9px 14px',
    fontSize: '12px', fontFamily: "'Poppins', sans-serif",
    color: TEXT, outline: 'none', cursor: 'pointer',
  };

  const pendingCancellations = reservations.filter(r => r.cancellationRequested);

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontWeight: '700', fontSize: '18px', color: TEXT }}>Reservation List</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: '10px', padding: '8px 14px' }}>
              <i className="ti ti-search" style={{ fontSize: '14px', color: MUTED }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search guest, status, etc"
                style={{ border: 'none', outline: 'none', fontSize: '12px', fontFamily: "'Poppins', sans-serif", width: '180px', background: 'transparent', color: TEXT }} />
            </div>

            {/* Filter */}
            <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} style={inp}>
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked-in">Checked-in</option>
              <option value="checked-out">Checked-out</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Add booking */}
            <button onClick={() => window.location.href = isReceptionist ? '/receptionist/walkin' : '/admin/walkin'}
              style={{ background: ACCENT, border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: ACCENT_TEXT }}>
              + Add Booking
            </button>
          </div>
        </div>

        {/* Pending Cancellation Requests — admin only */}
        {isAdmin && pendingCancellations.length > 0 && (
          <div style={{ background: CARD, borderRadius: '16px', border: `1px solid ${BORDER}`, padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontWeight: '700', fontSize: '13px', color: TEXT, marginBottom: '12px' }}>
              ⚠ Pending Cancellation Requests
            </div>
            {pendingCancellations.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${ROWLINE}` }}>
                <div style={{ fontSize: '12px', color: TEXT }}>
                  <strong>{r.guestName}</strong> — Room {r.roomNumber}
                  <div style={{ fontSize: '10px', color: MUTED }}>Reason: {r.cancellationReason || 'No reason given'}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => approveCancellation(r)}
                    style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Approve
                  </button>
                  <button onClick={() => denyCancellation(r.id)}
                    style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table card */}
        <div style={{ background: CARD, borderRadius: '16px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Guest', 'Room', 'Request', 'Duration', 'Check-in & Check-out', 'Type', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: '11px', color: MUTED, fontWeight: '500', padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, fontFamily: "'Poppins', sans-serif" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: MUTED, fontSize: '13px' }}>
                    No reservations found.
                  </td>
                </tr>
              ) : (
                paged.map(r => {
                  const b = statusBadge(r.status);
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${ROWLINE}` }}>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: TEXT, verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '600' }}>{r.guestName}</div>
                        <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>{r.id.slice(0, 8).toUpperCase()}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: TEXT, verticalAlign: 'top' }}>
                        <div>{r.roomNumber}</div>
                        <div style={{ fontSize: '10px', color: MUTED }}>{r.roomType}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: MUTED, verticalAlign: 'top' }}>{r.notes || 'None'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: TEXT, verticalAlign: 'top' }}>{nights(r)}</td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: TEXT, verticalAlign: 'top' }}>
                        {r.checkIn} – {r.checkOut}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', verticalAlign: 'top' }}>
                        <span style={{ background: typeBadge.bg, color: typeBadge.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '600', textTransform: 'capitalize' }}>
                          {r.type}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', verticalAlign: 'top' }}>
                        <span style={{ background: b.bg, color: b.color, padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: '600', textTransform: 'capitalize' }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', verticalAlign: 'top' }}>
                        {isReceptionist ? (
                          r.cancellationRequested ? (
                            <span style={{ fontSize: '10px', color: MUTED }}>Cancellation requested</span>
                          ) : (
                            <select value={r.status} onChange={e => {
                              if (e.target.value === 'cancelled') {
                                const reason = prompt('Reason for cancellation:');
                                if (reason !== null) requestCancellation(r.id, reason);
                              } else {
                                updateStatus(r.id, e.target.value);
                              }
                            }}
                              style={{ background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 8px', fontSize: '11px', fontFamily: "'Poppins', sans-serif", cursor: 'pointer', color: TEXT, outline: 'none' }}>
                              <option value="pending">Pending</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="checked-in">Checked-in</option>
                              <option value="checked-out">Checked-out</option>
                              <option value="cancelled">Request Cancellation</option>
                            </select>
                          )
                        ) : (
                          <select value={r.status} onChange={e => updateStatus(r.id, e.target.value)}
                            style={{ background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 8px', fontSize: '11px', fontFamily: "'Poppins', sans-serif", cursor: 'pointer', color: TEXT, outline: 'none' }}>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="checked-in">Checked-in</option>
                            <option value="checked-out">Checked-out</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: '11px', color: MUTED }}>
              Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  style={{ width: '28px', height: '28px', borderRadius: '8px', border: `1px solid ${BORDER2}`, background: page === i + 1 ? ACCENT : CARD2, fontWeight: page === i + 1 ? '700' : '400', fontSize: '11px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: page === i + 1 ? ACCENT_TEXT : TEXT }}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ width: '28px', height: '28px', borderRadius: '8px', border: `1px solid ${BORDER2}`, background: CARD2, cursor: 'pointer', fontSize: '14px', color: TEXT }}>
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}