import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../../firebase/firebase';
import { collection, getDocs, getDoc, updateDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import DashboardSkeleton from '../components/DashboardSkeleton';
import { useSettings } from '../components/SettingsContext';
import { SortControls, sortRecords } from '../lib/listSort';

const QUICK_VIEWS = {
  new: { label: 'New bookings', sortBy: 'booked', sortDir: 'desc' },
  arrivals: { label: "Today's check-ins", sortBy: 'checkin', sortDir: 'asc' },
  departures: { label: "Today's check-outs", sortBy: 'booked', sortDir: 'desc' },
  'checked-in': { label: 'Currently checked in', status: 'checked-in', sortBy: 'checkin', sortDir: 'desc' },
  'checked-out': { label: 'Checked out', status: 'checked-out', sortBy: 'checkin', sortDir: 'desc' },
  'pending-payment': { label: 'Pending payments', sortBy: 'booked', sortDir: 'desc' },
};

const localToday = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const matchesQuickView = (r, view) => {
  if (view === 'arrivals') return r.checkIn === localToday() && r.status !== 'cancelled';
  if (view === 'departures') return r.checkOut === localToday() && r.status !== 'cancelled';
  if (view === 'pending-payment') return r.paymentStatus === 'pending' && r.status !== 'cancelled';
  if (view === 'new') return r.status !== 'cancelled';
  return true;
};

export default function Reservations() {
  const { settings, formatDate } = useSettings();
  const dark = settings?.darkMode;
  const initialBookingQuery = (() => {
    try {
      return new URLSearchParams(window.location.search).get('booking') || '';
    } catch {
      return '';
    }
  })();

  const initialView = (() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view');
      return QUICK_VIEWS[v] ? v : '';
    } catch {
      return '';
    }
  })();

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const BG       = dark ? '#020b09' : '#f4f6f4';
  const CARD     = dark ? '#1c1c1c' : '#ffffff';
  const CARD2    = dark ? '#282827' : '#f4f6f4';
  const BORDER   = dark ? '#2a2a28' : '#e5e7eb';
  const BORDER2  = dark ? '#3a3a38' : '#e5e7eb';
  const ROWLINE  = dark ? '#242422' : '#f3f4f6';
  const TEXT     = dark ? '#f0f0f0' : '#111827';
  const MUTED    = dark ? '#9ca3af' : '#6b7280';
  const ACCENT   = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';

  // ── Role detection (based on route; swap for real auth/role context if available) ──
  const isReceptionist = window.location.pathname.startsWith('/receptionist');
  const isAdmin = !isReceptionist;

  const [reservations, setReservations] = useState([]);
  const [toast, setToast] = useState(null);
  const [cancelDialog, setCancelDialog] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState('');
  const [manualTotals, setManualTotals] = useState({});
  const [manualRefunds, setManualRefunds] = useState({});
  const [filter, setFilter]             = useState(QUICK_VIEWS[initialView]?.status || 'all');
  const [quickView, setQuickView]       = useState(initialView);
  const [sortBy, setSortBy]             = useState(QUICK_VIEWS[initialView]?.sortBy || 'booked');
  const [sortDir, setSortDir]           = useState(QUICK_VIEWS[initialView]?.sortDir || 'desc');
  const [search, setSearch]             = useState(initialBookingQuery);
  const [page,   setPage]               = useState(1);
  const [selectedId, setSelectedId]     = useState(null);
  const [autoOpened, setAutoOpened]     = useState(false);
  const [loaded, setLoaded]             = useState(false);
  const perPage = 10;
  const hasOutstandingBalance = (reservation) => Math.round((
    Number(reservation.totalAmount || 0) + Number(reservation.extraCharges || 0) - Number(reservation.amountPaid || 0)
  ) * 100) > 0;

  const releaseExpiredRooms = useCallback(async (data) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = data.filter(r => {
      if (!r.checkOut || hasOutstandingBalance(r) || ['checked-out', 'cancelled'].includes(r.status)) return false;
      const checkOut = new Date(`${r.checkOut}T00:00:00`);
      return !isNaN(checkOut.getTime()) && checkOut < today;
    });

    await Promise.all(expired.map(async reservation => {
      await updateDoc(doc(db, 'reservations', reservation.id), { status: 'checked-out' });
      if (reservation.roomId) {
        try {
          const roomRef = doc(db, 'rooms', reservation.roomId);
          const roomSnap = await getDoc(roomRef);
          if (roomSnap.exists() && roomSnap.data().status === 'occupied') {
            await updateDoc(roomRef, { status: 'vacant' });
          }
        } catch (roomErr) {
          console.warn('Expired room release skipped:', roomErr.message);
        }
      }
    }));

    return expired.map(r => ({ ...r, status: 'checked-out' }));
  }, []);

  const fetchReservations = useCallback(async () => {
    const snap = await getDocs(collection(db, 'reservations'));
    let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isAdmin) {
      const expired = data.filter(r => {
        if (!r.checkOut || hasOutstandingBalance(r) || ['checked-out', 'cancelled'].includes(r.status)) return false;
        const checkOut = new Date(`${r.checkOut}T00:00:00`);
        return !isNaN(checkOut.getTime()) && checkOut < new Date(new Date().setHours(0, 0, 0, 0));
      });
      if (expired.length) {
        await releaseExpiredRooms(data);
        data = data.map(r => expired.some(item => item.id === r.id) ? { ...r, status: 'checked-out' } : r);
      }
    }
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setReservations(data);
  }, [isAdmin, releaseExpiredRooms]);

  useEffect(() => {
    fetchReservations();
    const unsubscribe = onSnapshot(collection(db, 'reservations'), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReservations(data);
      setLoaded(true);
    }, error => {
      console.error('Unable to watch reservation status changes:', error);
      setLoaded(true);
      setToast({ type: 'error', text: 'Reservation updates could not be loaded.' });
    });
    return unsubscribe;
  }, [fetchReservations]);

  useEffect(() => {
    if (autoOpened || !initialBookingQuery || reservations.length === 0) return;
    const match = reservations.find(r => r.id === initialBookingQuery);
    if (match) setSelectedId(match.id);
    setAutoOpened(true);
  }, [autoOpened, initialBookingQuery, reservations]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = event => { if (event.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const openCancellationDialog = (kind, reservation) => {
    setCancelReason(kind === 'approve' ? reservation.cancellationReason || '' : '');
    setCancelDialog({ kind, reservation });
  };

const updateStatus = async (id, status, reason = '') => {
  const reservation = reservations.find(r => r.id === id);
  if (isReceptionist && reservation?.status === 'cancelled') return;
  if (status === 'cancelled') {
    await updateDoc(doc(db, 'reservations', id), {
      status: 'cancelled',
      cancellationRequested: false,
      cancellationReason: reason,
    });
    if (reservation?.roomId) {
      try {
        await updateDoc(doc(db, 'rooms', reservation.roomId), { status: 'vacant' });
      } catch (roomErr) {
        console.warn('Room status update skipped:', roomErr.message);
      }
    }
    await fetchReservations();
    return;
  }
  if (status === 'checked-out' && reservation && hasOutstandingBalance(reservation)) {
    alert('The outstanding balance must be paid before checking out this guest.');
    return;
  }
  try {
    await updateDoc(doc(db, 'reservations', id), { status });

    if (reservation?.roomId) {
      try {
        if (status === 'checked-in') {
          await updateDoc(doc(db, 'rooms', reservation.roomId), { status: 'occupied' });
        } else if (status === 'checked-out' || status === 'cancelled' || status === 'confirmed' || status === 'pending') {
          await updateDoc(doc(db, 'rooms', reservation.roomId), { status: 'vacant' });
        }
      } catch (roomErr) {
        console.warn('Room status update skipped:', roomErr.message);
      }
    }
    if (status === 'confirmed' && reservation?.status !== 'confirmed') {
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/send-reservation-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reservationId: id }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Confirmation email could not be sent.');
        setToast({ type: 'success', text: result.sent ? 'Booking confirmation email sent.' : result.alreadySent ? 'Booking confirmation email was already sent.' : 'Confirmation email is being sent.' });
      } catch (emailError) {
        setToast({ type: 'error', text: emailError.message || 'Confirmation email failed to send.' });
      }
    }
    await fetchReservations();
  } catch (error) {
    setToast({ type: 'error', text: error.message || 'Reservation status could not be updated.' });
  }
};
  // ── Cancellation request flow (receptionist requests, admin approves/denies) ──
  const requestCancellation = async (id, reason) => {
    await updateDoc(doc(db, 'reservations', id), {
      cancellationRequested: true,
      cancellationRequestedBy: auth.currentUser?.uid || null,
      cancellationRequestedAt: serverTimestamp(),
      cancellationReason: reason.trim(),
    });
      await fetchReservations();
  };

  const decideRequest = async (action, reservation, extra = {}) => {
    const request = action.includes('refund')
      ? { requestId: reservation.refundRequestId }
      : { requestId: reservation.modificationRequest?.id };
    if (!request.requestId) {
      setToast({ type: 'error', text: 'This request no longer has a valid reference.' });
      return;
    }
    let reason = '';
    if (['reject-refund', 'reject-modification', 'review-refund'].includes(action)) {
      reason = window.prompt('Add a reason for the decision:') || '';
      if (action !== 'review-refund' && !reason.trim()) return;
    }
    setDecisionBusy(reservation.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in again before reviewing requests.');
      const response = await fetch('/api/reservation-staff-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          reservationId: reservation.id,
          ...request,
          reason,
          ...extra,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not process the decision.');
      setToast({
        type: 'success',
        text: result.checkoutUrl
          ? 'Approved. The secure payment link was emailed to the guest.'
          : action.includes('refund')
            ? 'Refund decision recorded; the case remains open until PayMongo confirms processing.'
            : `Schedule change ${result.status === 'rejected' ? 'rejected' : 'approved'}.`,
      });
      await fetchReservations();
    } catch (error) {
      setToast({ type: 'error', text: error.message || 'Could not process the decision.' });
    } finally {
      setDecisionBusy('');
    }
  };

    const approveCancellation = async (reservation, reason) => {
    await updateDoc(doc(db, 'reservations', reservation.id), {
      status: 'cancelled',
      cancellationRequested: false,
        cancellationReason: reason.trim(),
    });
    if (reservation.roomId) {
      try {
        await updateDoc(doc(db, 'rooms', reservation.roomId), { status: 'vacant' });
      } catch (err) {
        console.warn('Room status update skipped:', err.message);
      }
    }
    await fetchReservations();
  };

  const denyCancellation = async (id) => {
    await updateDoc(doc(db, 'reservations', id), { cancellationRequested: false });
    fetchReservations();
  };

  const confirmCancellation = async () => {
    if (!cancelDialog || cancelBusy) return;
    setCancelBusy(true);
    try {
      if (cancelDialog.kind === 'request') {
        await requestCancellation(cancelDialog.reservation.id, cancelReason);
      } else if (cancelDialog.kind === 'approve') {
        await approveCancellation(cancelDialog.reservation, cancelReason);
      } else {
        await updateStatus(cancelDialog.reservation.id, 'cancelled', cancelReason);
      }
      setCancelDialog(null);
      setToast({ type: 'success', text: cancelDialog.kind === 'request' ? 'Cancellation request submitted.' : 'Reservation cancelled.' });
    } catch (error) {
      console.error('Unable to complete reservation cancellation:', error);
      setToast({ type: 'error', text: error.message || 'Cancellation could not be completed.' });
    } finally {
      setCancelBusy(false);
    }
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

  const selectedReservation = selectedId ? reservations.find(r => r.id === selectedId) : null;

  const filtered = sortRecords(reservations.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter;
    const matchQuick = !quickView || matchesQuickView(r, quickView);
    const matchSearch =
      r.guestName?.toLowerCase().includes(search.toLowerCase()) ||
      r.roomNumber?.includes(search) ||
      r.status?.includes(search.toLowerCase()) ||
      r.id?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchQuick && matchSearch;
  }), sortBy, sortDir);

  const clearQuickView = () => {
    setQuickView('');
    setFilter('all');
    setPage(1);
    window.history.replaceState(null, '', window.location.pathname);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged      = filtered.slice((page - 1) * perPage, page * perPage);

  const inp = {
    background: CARD2, border: `1px solid ${BORDER2}`,
    borderRadius: '10px', padding: '9px 14px',
    fontSize: '12px', fontFamily: "'Poppins', sans-serif",
    color: TEXT, outline: 'none', cursor: 'pointer',
  };

  const pendingCancellations = reservations.filter(r => r.cancellationRequested);
  const pendingRefunds = isAdmin ? reservations.filter(r =>
    ['eligible', 'needs_review'].includes(String(r.refundRequestStatus || '').toLowerCase())) : [];
  const pendingModifications = reservations.filter(r =>
    ['requested', 'needs_review'].includes(String(r.modificationRequest?.status || '').toLowerCase()));

  if (!loaded) return <PageLayout><DashboardSkeleton /></PageLayout>;

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>

        {toast && (
          <div role="status" onClick={() => setToast(null)}
            style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1000, maxWidth: '360px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', background: toast.type === 'error' ? '#fee2e2' : '#dcfce7', color: toast.type === 'error' ? '#991b1b' : '#166534', border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: '12px' }}>
            {toast.text}
          </div>
        )}

        {cancelDialog && (
          <div role="presentation" onClick={event => {
            if (event.target === event.currentTarget && !cancelBusy) setCancelDialog(null);
          }} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.48)', display: 'grid', placeItems: 'center', padding: '18px' }}>
            <section role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title"
              style={{ width: '100%', maxWidth: '440px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '22px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h2 id="cancel-dialog-title" style={{ color: TEXT, fontSize: '17px', margin: '0 0 10px' }}>
                {cancelDialog.kind === 'request' ? 'Request reservation cancellation?' : 'Cancel this reservation?'}
              </h2>
              <p style={{ color: MUTED, fontSize: '13px', margin: '0 0 16px' }}>
                Are you sure you want to cancel the reservation for {cancelDialog.reservation.guestName || 'this guest'} (Room {cancelDialog.reservation.roomNumber || '—'})?
                {cancelDialog.kind === 'request' && ' This will send a request to an administrator for approval.'}
              </p>
              <label htmlFor="cancellation-reason" style={{ display: 'block', color: MUTED, fontSize: '12px', marginBottom: '6px' }}>Reason (optional)</label>
              <textarea id="cancellation-reason" value={cancelReason} onChange={event => setCancelReason(event.target.value)}
                rows={3} maxLength={500} disabled={cancelBusy} placeholder="Enter a reason for cancellation"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1px solid ${BORDER2}`, borderRadius: '9px', padding: '10px', color: TEXT, background: CARD2, font: 'inherit', fontSize: '13px' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', marginTop: '18px' }}>
                <button type="button" disabled={cancelBusy} onClick={() => setCancelDialog(null)}
                  style={{ border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '9px 14px', background: CARD2, color: TEXT, cursor: 'pointer' }}>Keep reservation</button>
                <button type="button" disabled={cancelBusy} onClick={confirmCancellation}
                  style={{ border: 'none', borderRadius: '8px', padding: '9px 14px', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: cancelBusy ? 'wait' : 'pointer' }}>
                  {cancelBusy ? 'Processing…' : cancelDialog.kind === 'request' ? 'Confirm request' : 'Confirm cancellation'}
                </button>
              </div>
            </section>
          </div>
        )}

        {selectedReservation && (() => {
          const s = selectedReservation;
          const sb = statusBadge(s.status);
          const money = v => (v === undefined || v === null || v === '' ? '—' : `₱${Number(v).toLocaleString()}`);
          const rows = [
            ['Phone Number', s.phone || 'Not provided'],
            ['Email Address', s.email || 'Not provided'],
            ['Preferred Contact Method', s.preferredContactMethod || 'Not provided'],
            ['Room', [s.roomNumber, s.roomType].filter(Boolean).join(' · ') || '—'],
            ['Check-in', s.checkIn || '—'],
            ['Check-out', s.checkOut || '—'],
            ['Duration', nights(s)],
            ['Special Requests', s.notes || 'None'],
            ['Payment Status', s.paymentStatus || '—'],
            ['Payment Method', s.paymentMethod || '—'],
            ['Total Amount', money(s.totalAmount)],
            ['Amount Paid', money(s.amountPaid)],
          ];
          return (
            <div role="presentation" onClick={event => { if (event.target === event.currentTarget) setSelectedId(null); }}
              style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', padding: '18px' }}>
              <section role="dialog" aria-modal="true" aria-labelledby="reservation-details-title"
                style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '22px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', fontFamily: "'Poppins', sans-serif" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <h2 id="reservation-details-title" style={{ color: TEXT, fontSize: '18px', margin: 0 }}>{s.guestName || 'Guest'}</h2>
                    <div style={{ color: ACCENT, fontSize: '12px', marginTop: '3px' }}>Booking ID: {s.id.slice(0, 8).toUpperCase()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: sb.bg, color: sb.color, padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, textTransform: 'capitalize' }}>{s.status}</span>
                    <button type="button" aria-label="Close details" onClick={() => setSelectedId(null)}
                      style={{ border: `1px solid ${BORDER2}`, background: CARD2, color: TEXT, borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', fontSize: '16px' }}>×</button>
                  </div>
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px 18px', margin: 0 }}>
                  {rows.map(([label, value]) => (
                    <div key={label} style={{ gridColumn: label === 'Special Requests' ? '1 / -1' : undefined }}>
                      <dt style={{ color: MUTED, fontSize: '11px' }}>{label}</dt>
                      <dd style={{ color: TEXT, fontSize: '13px', margin: '2px 0 0', textTransform: label === 'Payment Status' ? 'capitalize' : 'none', wordBreak: 'break-word' }}>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" onClick={() => setSelectedId(null)}
                    style={{ border: 'none', borderRadius: '8px', padding: '9px 16px', background: ACCENT, color: ACCENT_TEXT, fontWeight: 700, cursor: 'pointer' }}>Close</button>
                </div>
              </section>
            </div>
          );
        })()}

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

            {quickView && (
              <button onClick={clearQuickView} title="Clear card filter"
                style={{ ...inp, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                {QUICK_VIEWS[quickView].label} <i className="ti ti-x" style={{ fontSize: '12px' }} />
              </button>
            )}

            <SortControls sortBy={sortBy} sortDir={sortDir}
              onSortBy={v => { setSortBy(v); setPage(1); }}
              onSortDir={v => { setSortDir(v); setPage(1); }} style={inp} />

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
                  <button onClick={() => openCancellationDialog('approve', r)}
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

        {(pendingRefunds.length > 0 || pendingModifications.length > 0) && (
          <section aria-label="Refund and schedule-change review" style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
            {pendingRefunds.map(r => (
              <article key={`refund-${r.id}`} style={{ background: CARD, borderRadius: '14px', border: `1px solid ${BORDER}`, padding: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: TEXT }}>Refund request · {r.guestName || 'Guest'} · #{r.id.slice(0, 8).toUpperCase()}</div>
                <p style={{ margin: '8px 0', color: MUTED, fontSize: '12px' }}>
                  {r.refundDecision?.reason || 'Staff review requested'} · Proposed refund ₱{Number(r.refundDecision?.refundableAmount || 0).toLocaleString()}
                </p>
                {r.refundDecision?.alternatives?.length > 0 && (
                  <p style={{ margin: '4px 0 10px', color: MUTED, fontSize: '11px' }}>Options: {r.refundDecision.alternatives.join(' ')}</p>
                )}
                  {r.refundRequestStatus === 'needs_review' && (
                    <label style={{ display: 'inline-grid', gap: 4, margin: '0 10px 10px 0', color: MUTED, fontSize: 11 }}>
                      Staff-verified refund amount (₱)
                      <input type="number" min="0.01" step="0.01" value={manualRefunds[r.id] || ''}
                        onChange={event => setManualRefunds(current => ({ ...current, [r.id]: event.target.value }))}
                        style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 7, padding: '8px' }} />
                    </label>
                  )}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button disabled={decisionBusy === r.id || (r.refundRequestStatus === 'needs_review' && !manualRefunds[r.id])}
                      onClick={() => decideRequest('approve-refund', r, r.refundRequestStatus === 'needs_review' ? { amount: manualRefunds[r.id] } : {})}
                    style={{ background: '#166534', color: '#fff', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Approve &amp; refund</button>
                  <button disabled={decisionBusy === r.id} onClick={() => decideRequest('reject-refund', r)}
                    style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Reject</button>
                  <button disabled={decisionBusy === r.id} onClick={() => decideRequest('review-refund', r)}
                    style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Keep for manual review</button>
                </div>
              </article>
            ))}
            {pendingModifications.map(r => {
              const request = r.modificationRequest;
              const requiresManualPrice = request.outcome === 'needs_review';
              return (
                <article key={`modification-${r.id}`} style={{ background: CARD, borderRadius: '14px', border: `1px solid ${BORDER}`, padding: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: TEXT }}>Schedule change · {r.guestName || 'Guest'} · #{r.id.slice(0, 8).toUpperCase()}</div>
                  <p style={{ margin: '8px 0', color: MUTED, fontSize: '12px' }}>
                    {request.originalCheckIn} – {request.originalCheckOut} → {request.requestedCheckIn} – {request.requestedCheckOut}
                  </p>
                  <p style={{ margin: '4px 0 10px', color: MUTED, fontSize: '12px' }}>{request.reason}</p>
                  {requiresManualPrice && (
                    <label style={{ display: 'inline-grid', gap: 4, margin: '0 10px 10px 0', color: MUTED, fontSize: 11 }}>
                      Staff-verified updated total (₱)
                      <input type="number" min="1" step="0.01" value={manualTotals[r.id] || ''}
                        onChange={event => setManualTotals(current => ({ ...current, [r.id]: event.target.value }))}
                        style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 7, padding: '8px' }} />
                    </label>
                  )}
                  {request.paymentDue > 0 && <p style={{ color: MUTED, fontSize: 11 }}>50% deposit due on extension: ₱{Number(request.paymentDue).toLocaleString()}</p>}
                  {request.refundDue > 0 && <p style={{ color: MUTED, fontSize: 11 }}>Calculated refund after reduction: ₱{Number(request.refundDue).toLocaleString()}</p>}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button disabled={decisionBusy === r.id} onClick={() => decideRequest(
                      'approve-modification', r,
                      requiresManualPrice ? { updatedTotal: manualTotals[r.id] } : {},
                    )} style={{ background: '#166534', color: '#fff', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Approve</button>
                    <button disabled={decisionBusy === r.id} onClick={() => decideRequest('reject-modification', r)}
                      style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Reject</button>
                  </div>
                </article>
              );
            })}
          </section>
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
                    <tr key={r.id} role="button" tabIndex={0}
                      onClick={() => setSelectedId(r.id)}
                      onKeyDown={e => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id); }
                      }}
                      style={{ borderBottom: `1px solid ${ROWLINE}`, cursor: 'pointer' }}>
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
                        {formatDate(r.checkIn)} – {formatDate(r.checkOut)}
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
                      <td onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} style={{ padding: '14px 16px', fontSize: '12px', verticalAlign: 'top', cursor: 'default' }}>
                        {isReceptionist ? (
                          r.status === 'cancelled' ? (
                            <span title="Cancelled bookings can only be changed by an admin" style={{ fontSize: '10px', color: MUTED, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <i className="ti ti-lock" /> Cancelled – locked
                            </span>
                          ) : r.cancellationRequested ? (
                            <span style={{ fontSize: '10px', color: MUTED }}>Cancellation requested</span>
                          ) : (
                            <select value={r.status} onChange={e => {
                              if (e.target.value === 'cancelled') {
                                openCancellationDialog('request', r);
                              } else {
                                updateStatus(r.id, e.target.value);
                              }
                            }}
                              style={{ background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 8px', fontSize: '11px', fontFamily: "'Poppins', sans-serif", cursor: 'pointer', color: TEXT, outline: 'none' }}>
                              <option value="pending">Pending</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="checked-in">Checked-in</option>
                              <option value="checked-out" disabled={hasOutstandingBalance(r)}>Checked-out</option>
                              <option value="cancelled">{r.status === 'cancelled' ? 'Cancelled' : 'Request Cancellation'}</option>
                            </select>
                          )
                        ) : (
                          <select value={r.status} onChange={e => {
                            if (e.target.value === 'cancelled') openCancellationDialog('cancel', r);
                            else updateStatus(r.id, e.target.value);
                          }}
                            style={{ background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 8px', fontSize: '11px', fontFamily: "'Poppins', sans-serif", cursor: 'pointer', color: TEXT, outline: 'none' }}>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="checked-in">Checked-in</option>
                            <option value="checked-out" disabled={hasOutstandingBalance(r)}>Checked-out</option>
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