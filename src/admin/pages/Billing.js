import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../firebase/firebase';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { createPayMongoCheckout, checkPayMongoCheckoutStatus } from '../../lib/paymongo';
import { SortControls, sortRecords } from '../lib/listSort';
import { receiptNotice, staffApi } from '../lib/staffApi';
import { SERVICES, getService, isRoomGuest, priceService } from '../../lib/services';
import { getVatBreakdown } from '../../lib/bookingPricing';
import { getScheduledCheckOutMs, formatManilaTime } from '../../lib/reservationStatus';
import { appAlert, appConfirm } from '../../components/ui/app-dialog';
import QRCode from 'qrcode';
import PhoneDisplayToggle from '../components/PhoneDisplayToggle';
import SeniorPwdDiscountForm from '../components/SeniorPwdDiscountForm';
import PromoCodeForm from '../components/PromoCodeForm';
import AgencyBillingCard from '../components/AgencyBillingCard';
import { agencyStatusLabel, canStayOnAgencyCredit, isAgencyBilled } from '../../lib/agencyBilling';

// Rooms booked together (one reservation, several rooms) share one bill.
const billKeyOf = r => (Array.isArray(r.groupReservationIds) && r.groupReservationIds.length > 1 ? (r.groupId || r.groupReservationIds[0]) : r.id);
const roomsOfBill = (r, list) => (r ? list.filter(item => billKeyOf(item) === billKeyOf(r)).map(item => (item.id === r.id ? r : item)) : []);
const owedOf = r => Number(r.totalAmount || 0) + Number(r.extraCharges || 0) - Number(r.amountPaid || 0);
const billOwed = rooms => rooms.reduce((sum, r) => sum + owedOf(r), 0);

export default function Billing() {
  const { settings, formatCurrency, formatDate } = useSettings();
  const dark = settings?.darkMode;
  const navigate = useNavigate();
  const location = useLocation();
  const portalBase = location.pathname.startsWith('/receptionist') ? '/receptionist' : '/admin';
  // Opened from the reservation list: offer a one-click way back to it.
  const cameFromReservations = new URLSearchParams(location.search).get('from') === 'reservations';
  const backToReservations = () => {
    const booking = new URLSearchParams(location.search).get('booking');
    navigate(`${portalBase}/reservations${booking ? `?booking=${encodeURIComponent(booking)}` : ''}`);
  };

  // ── Colours: the same as the other staff pages (Payments, Reports…) ──
  const BG       = dark ? '#020b09' : '#f4f6f4';
  const CARD     = dark ? '#1c1c1c' : '#ffffff';
  const CARD2    = dark ? '#282827' : '#f9fafb';
  const BORDER   = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT     = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT  = dark ? '#c7c7c0' : '#4b5563';
  const MUTED    = '#9ca3af';
  const SELECTED = dark ? '#242b1e' : '#f3f8ec';
  const ACCENT   = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const BRASS    = '#A67C3D';
  const BRASS_TEXT = '#221604';
  const GREEN    = dark ? '#86efac' : '#15803d';
  const GREEN_BTN = '#2f6b3a';
  const RED      = dark ? '#fca5a5' : '#b91c1c';
  const OK_BG    = dark ? '#14532d' : '#dcfce7';
  const OK_TEXT  = dark ? '#86efac' : '#166534';

  const SANS = "'Poppins', sans-serif";
  const MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";

  const [reservations, setReservations] = useState([]);
  const [sortBy, setSortBy] = useState('booked');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(null);
  const [extraCharge, setExtraCharge] = useState({ description: '', amount: '' });
  const [search, setSearch] = useState('');
  // Rate-card service being added (spa / photoshoot). Priced again on the server.
  const [service, setService] = useState({ serviceId: 'spa', hours: 1, persons: 5 });
  const [paymentAmount, setPaymentAmount] = useState('');
  // How the guest paid at the desk. The resort has no card terminal.
  const [deskMethod, setDeskMethod] = useState('cash');
  // Number on the paper receipt handed to the guest, if the desk writes one.
  const [paperReceiptNo, setPaperReceiptNo] = useState('');
  const [success, setSuccess] = useState('');

  // ── PayMongo payment link ──────────────────────────────────
  const [payLink, setPayLink] = useState('');
  const [checkoutSessionId, setCheckoutSessionId] = useState('');
  const [payLinkLoading, setPayLinkLoading] = useState(false);
  const [payLinkError, setPayLinkError] = useState('');
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusResult, setStatusResult] = useState(''); // '', 'unpaid', 'paid', 'expired'

  const fetchReservations = async () => {
    const snap = await getDocs(collection(db, 'reservations'));
    setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status !== 'cancelled' && r.type !== 'corporate-room'
        // Agency groups stay here after check-out until the agency pays.
        && (r.status !== 'checked-out' || (isAgencyBilled(r) && owedOf(r) > 0.004))));
  };

  useEffect(() => { fetchReservations(); }, []);

  // Opened from a booking (?booking=<id>): select it and fill in the balance.
  const [preselectDone, setPreselectDone] = useState(false);
  useEffect(() => {
    if (preselectDone || reservations.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get('booking');
    setPreselectDone(true);
    const found = wanted && reservations.find(r => r.id === wanted);
    // Open the bill on its first room, so linked rooms show as one bill.
    const match = found && (reservations.find(r => r.id === billKeyOf(found)) || found);
    if (match) {
      setSelected(match);
      const owed = billOwed(roomsOfBill(match, reservations));
      if (owed > 0) setPaymentAmount(String(Math.round(owed * 100) / 100));
    }
  }, [reservations, preselectDone]);

  // Live-updates the open reservation so a PayMongo payment (confirmed by
  // the webhook, which writes straight to Firestore) shows up here the
  // moment it lands, without staff needing to click back into the list.
  useEffect(() => {
    if (!selected?.id) return;
    const unsub = onSnapshot(doc(db, 'reservations', selected.id), (snap) => {
      if (!snap.exists()) return;
      const data = { id: snap.id, ...snap.data() };
      setSelected(data);
      setReservations(prev => prev.map(r => (r.id === data.id ? data : r)));
    });
    return unsub;
  }, [selected?.id]);

  // Totals cover every room on the bill.
  const billRooms = roomsOfBill(selected, reservations);
  const isGroupBill = billRooms.length > 1;
  const totalPaid = (r) => roomsOfBill(r, reservations).reduce((sum, room) => sum + Number(room.amountPaid || 0), 0);
  const totalBalance = (r) => billOwed(roomsOfBill(r, reservations));

  const selectReservation = (r) => {
    setSelected(r);
    setSuccess('');
    setPayLink('');
    setCheckoutSessionId('');
    setPayLinkError('');
    setStatusResult('');
  };

  // Charges and payments are saved by the server, which works out the new
  // balance and refuses payments larger than what the guest owes.
  const [billingBusy, setBillingBusy] = useState(false);
  const handleAddExtra = async () => {
    if (!extraCharge.description || !extraCharge.amount || billingBusy) return;
    setBillingBusy(true);
    try {
      const result = await staffApi('staff-billing', {
        action: 'add-charge', reservationId: selected.id, amount: Number(extraCharge.amount), description: extraCharge.description,
      });
      setExtraCharge({ description: '', amount: '' });
      setSelected(prev => ({ ...prev, extraCharges: result.extraCharges }));
      fetchReservations();
      setSuccess('Extra charge added.');
    } catch (error) {
      appAlert(error.message, { title: 'Couldn’t save', tone: 'danger' });
    } finally {
      setBillingBusy(false);
    }
  };

  // Extra guests at the desk: the booking is repriced with the room's own
  // extra-guest rates and limit (same rules as Edit booking).
  const [guestEdit, setGuestEdit] = useState({ roomId: '', adults: '', children: '' });
  const handleExtraGuests = async () => {
    if (billingBusy || !selected) return;
    const room = roomsOfBill(selected, reservations).find(r => r.id === guestEdit.roomId) || selected;
    const adults = guestEdit.adults === '' ? Number(room.adults || 0) : Number(guestEdit.adults);
    const children = guestEdit.children === '' ? Number(room.children || 0) : Number(guestEdit.children);
    if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
      appAlert('Enter at least 1 adult, and 0 or more children.', { title: 'Check the guest count', tone: 'warning' });
      return;
    }
    if (adults === Number(room.adults || 0) && children === Number(room.children || 0)) {
      appAlert('Change the number of adults or children first.', { title: 'No change', tone: 'info' });
      return;
    }
    setBillingBusy(true);
    try {
      const body = { action: 'edit-booking', reservationId: room.id, changes: { adults, children } };
      const quote = await staffApi('staff-billing', { ...body, preview: true });
      const ok = await appConfirm(
        `Room ${room.roomNumber || ''}: ${adults} adult${adults === 1 ? '' : 's'}${children ? `, ${children} child${children === 1 ? '' : 'ren'}` : ''} (was ${Number(room.adults || 0)}${Number(room.children || 0) ? ` + ${Number(room.children)}` : ''}). `
        + (quote.difference > 0
          ? `Extra guest charge: ${formatCurrency(quote.difference)}. It's added to the booking total.`
          : 'No extra charge. Fewer guests are not refunded under the resort policy.'),
        { title: 'Update the guests?', tone: 'info', confirmLabel: quote.difference > 0 ? `Add ${formatCurrency(quote.difference)}` : 'Save' },
      );
      if (!ok) return;
      const saved = await staffApi('staff-billing', body);
      setGuestEdit({ roomId: '', adults: '', children: '' });
      fetchReservations();
      setSuccess(`Guests updated for Room ${room.roomNumber || ''}.${saved.difference > 0 ? ` Extra guest charge ${formatCurrency(saved.difference)} added.` : ''}`);
    } catch (error) {
      appAlert(error.message, { title: 'Couldn’t update the guests', tone: 'danger' });
    } finally {
      setBillingBusy(false);
    }
  };

  const handleAddService = async () => {
    if (billingBusy) return;
    setBillingBusy(true);
    try {
      const result = await staffApi('staff-billing', {
        action: 'add-service', reservationId: selected.id,
        serviceId: service.serviceId, hours: Number(service.hours), persons: Number(service.persons),
      });
      setSelected(prev => ({ ...prev, extraCharges: result.extraCharges }));
      fetchReservations();
      setSuccess(`${result.description} added (${formatCurrency(result.amount)}).`);
    } catch (error) {
      appAlert(error.message, { title: 'Couldn’t save', tone: 'danger' });
    } finally {
      setBillingBusy(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentAmount || billingBusy) return;
    setBillingBusy(true);
    try {
      const result = await staffApi('staff-billing', {
        action: isGroupBill ? 'record-group-payment' : 'record-payment', reservationId: selected.id, amount: Number(paymentAmount), method: deskMethod,
        officialReceiptNo: paperReceiptNo.trim(),
      });
      if (!isGroupBill) setSelected(prev => ({ ...prev, amountPaid: result.amountPaid, paymentStatus: result.paymentStatus, ...(result.autoCheckedIn ? { status: 'checked-in' } : result.autoConfirmed ? { status: 'confirmed' } : {}) }));
      fetchReservations();
      setSuccess(`Payment of ${formatCurrency(paymentAmount)} recorded.${result.autoCheckedIn ? ' Fully paid: the guest is now checked in.' : result.autoConfirmed ? ' The booking is now confirmed.' : ''}${receiptNotice(result)}`);
      setPaymentAmount('');
      setPaperReceiptNo('');
    } catch (error) {
      appAlert(error.message, { title: 'Couldn’t save', tone: 'danger' });
    } finally {
      setBillingBusy(false);
    }
  };

  const handleGeneratePayMongoLink = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) return;
    setPayLinkLoading(true);
    setPayLinkError('');
    setPayLink('');
    setStatusResult('');
    try {
      const { checkoutUrl, checkoutSessionId: sessionId } = await createPayMongoCheckout({
        reservationId: selected.id,
        amount: Number(paymentAmount),
        ...(isGroupBill ? { paymentType: 'group' } : {}),
      });
      setPayLink(checkoutUrl);
      setCheckoutSessionId(sessionId || '');
    } catch (err) {
      setPayLinkError(err.message || 'Could not generate payment link. Try again.');
    } finally {
      setPayLinkLoading(false);
    }
  };

  // Asks PayMongo directly whether this checkout session was paid, instead
  // of waiting on the webhook. This is the fallback for exactly the
  // situation where a guest paid but the webhook never landed.
  const handleCheckStatus = async () => {
    if (!checkoutSessionId) return;
    setStatusChecking(true);
    setStatusResult('');
    try {
      const { status, amountPaid, recorded, receipt, receiptError } = await checkPayMongoCheckoutStatus(checkoutSessionId);
      setStatusResult(status);
      if (status === 'paid') {
        await fetchReservations();
        const paymentNotice = recorded
          ? `${formatCurrency(amountPaid)} recorded.`
          : `${formatCurrency(amountPaid)} was already recorded.`;
        const emailNotice = receiptError
          ? ` Receipt email failed: ${receiptError}`
          : receipt?.sent
            ? ` Receipt ${receipt.receiptNumber} emailed.`
            : receipt?.alreadySent
              ? ' Receipt email was already sent.'
              : ' Receipt email is being sent.';
        setSuccess(`Confirmed with PayMongo — ${paymentNotice}${emailNotice}`);
        setPayLink('');
        setCheckoutSessionId('');
        setPaymentAmount('');
      }
    } catch (err) {
      setPayLinkError(err.message || 'Could not reach PayMongo. Try again.');
    } finally {
      setStatusChecking(false);
    }
  };

  // QR of the payment link, so a guest at the desk can scan and pay on their phone.
  const [payQr, setPayQr] = useState('');
  useEffect(() => {
    if (!payLink) { setPayQr(''); return undefined; }
    let active = true;
    QRCode.toDataURL(payLink, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (active) setPayQr(url); })
      .catch(() => { if (active) setPayQr(''); });
    return () => { active = false; };
  }, [payLink]);

  // While the QR is showing, check every 8 seconds if the guest has paid.
  const checkStatusRef = useRef(null);
  checkStatusRef.current = handleCheckStatus;
  useEffect(() => {
    if (!checkoutSessionId) return undefined;
    const timer = setInterval(async () => {
      try {
        const { status } = await checkPayMongoCheckoutStatus(checkoutSessionId);
        if (status === 'paid') { clearInterval(timer); checkStatusRef.current?.(); }
        if (status === 'expired') { clearInterval(timer); setStatusResult('expired'); }
      } catch { /* try again on the next tick */ }
    }, 8000);
    return () => clearInterval(timer);
  }, [checkoutSessionId]);

  const copyPayLink = async () => {
    try {
      await navigator.clipboard.writeText(payLink);
      setSuccess('Payment link copied.');
    } catch {
      // Clipboard permission denied — the link is still visible/selectable in the field.
    }
  };

  const handleCheckout = async () => {
    if (totalBalance(selected) > 0) return appAlert('Collect the remaining balance before checking this guest out.', { title: 'Balance still due', tone: 'warning' });
    // The server re-checks the balance, records late check-outs, and sets the room to cleaning.
    // Rooms booked together check out together.
    try {
      const token = await auth.currentUser.getIdToken();
      const leaving = isGroupBill ? billRooms.filter(room => room.status === 'checked-in') : [selected];
      for (const room of leaving) {
        const response = await fetch('/api/reservation-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'set-status', reservationId: room.id, status: 'checked-out' }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${isGroupBill ? `Room ${room.roomNumber || ''}: ` : ''}${result.error || 'The guest could not be checked out.'}`);
      }
    } catch (checkoutError) {
      appAlert(checkoutError.message, { title: 'Couldn’t check out', tone: 'danger' });
      return;
    }
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch('/api/send-thank-you', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reservationId: selected.id }),
      });
    } catch (thankYouError) {
      console.warn('Thank-you email skipped:', thankYouError.message);
    }
    const roomLabel = isGroupBill ? `Rooms ${billRooms.map(room => room.roomNumber).filter(Boolean).join(', ')} are` : `${selected.roomName || 'The room'} is`;
    setSelected(null);
    fetchReservations();
    setSuccess(`Guest has checked out. ${roomLabel} now under cleaning/maintenance.`);
  };

  const inp = {
    border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 11px',
    fontSize: 13, fontFamily: SANS, background: CARD2, color: TEXT, outline: 'none', boxSizing: 'border-box',
  };

  const money = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

  const Receipt = ({ label, value, strong }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <span style={{ color: strong ? TEXT : SUBTEXT, fontSize: strong ? '13px' : '12.5px', fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${BORDER}`, marginBottom: '3px' }} />
      <span style={{ ...money, color: TEXT, fontSize: strong ? '15px' : '13px', fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );

  // Search by guest, room, phone, email or booking reference.
  const searchTerm = search.trim().toLowerCase().replace(/^#/, '');
  const matches = r => !searchTerm || [
    r.guestName, r.roomNumber && `room ${r.roomNumber}`, r.roomNumber, r.phone, r.email, r.id,
  ].some(value => String(value || '').toLowerCase().includes(searchTerm));
  // One entry per bill: the first room stands for the rooms booked with it.
  const billMains = reservations.filter(r => {
    const key = billKeyOf(r);
    return (reservations.find(other => other.id === key) || reservations.find(other => billKeyOf(other) === key)) === r;
  });
  const shownReservations = sortRecords(billMains.filter(r => roomsOfBill(r, reservations).some(matches)), sortBy, sortDir);
  const roomsText = r => {
    const rooms = roomsOfBill(r, reservations);
    if (r.cottageOnly) return 'Cottage';
    return rooms.length > 1 ? `Rooms ${rooms.map(room => room.roomNumber || '—').join(', ')}` : `Room ${r.roomNumber || '—'}`;
  };

  const selectedService = getService(service.serviceId);
  const servicePrice = selected ? priceService(service.serviceId, { ...service, roomGuest: isRoomGuest(selected) }) : null;

  // ── Check-out with a confirmation (it can't be undone) ─────
  const confirmAndCheckout = async () => {
    if (totalBalance(selected) > 0 && !onAgencyCredit) {
      appAlert('Collect the remaining balance before checking this guest out.', { title: 'Balance still due', tone: 'warning' });
      return;
    }
    const scheduled = getScheduledCheckOutMs(selected);
    const early = scheduled ? scheduled - Date.now() : 0;
    const when = scheduled
      ? `${new Date(scheduled).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })} at ${formatManilaTime(scheduled)}`
      : 'not set';
    const hoursEarly = Math.floor(early / 3600000);
    const minutesEarly = Math.round((early % 3600000) / 60000);
    const earlyText = early > 30 * 60000
      ? ` That's ${hoursEarly ? `${hoursEarly} h ` : ''}${minutesEarly} min before their check-out time.`
      : '';
    const ok = await appConfirm(
      `Check out ${selected.guestName || 'this guest'} now? Their check-out time is ${when}.${earlyText} Only continue if the guest has returned the key and is leaving. The room will be set to cleaning and a thank-you email is sent.`,
      { title: early > 30 * 60000 ? 'Check out early?' : 'Is this guest ready to check out?', tone: early > 30 * 60000 ? 'warning' : 'info', confirmLabel: 'Yes, check out' },
    );
    if (ok) handleCheckout();
  };

  const card = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' };
  const stepTitle = (number, title, hint) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', background: ACCENT, color: ACCENT_TEXT, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{number}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{title}</div>
        {hint && <div style={{ fontSize: 11.5, color: SUBTEXT, marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );
  const statusPill = status => {
    const map = {
      'checked-in': dark ? ['#1e3a5f', '#93c5fd'] : ['#dbeafe', '#1d4ed8'],
      confirmed: dark ? ['#14532d', '#86efac'] : ['#dcfce7', '#15803d'],
      pending: dark ? ['#78350f', '#fde68a'] : ['#fef3c7', '#b45309'],
    };
    const [bg, fg] = map[status] || map.pending;
    return <span style={{ background: bg, color: fg, borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{String(status || 'pending').replace('-', ' ')}</span>;
  };
  const btn = (kind = 'plain') => ({
    border: kind === 'plain' ? `1px solid ${BORDER}` : 'none',
    background: kind === 'primary' ? ACCENT : kind === 'green' ? GREEN_BTN : kind === 'brass' ? BRASS : CARD2,
    color: kind === 'primary' ? ACCENT_TEXT : kind === 'green' ? '#fff' : kind === 'brass' ? BRASS_TEXT : TEXT,
    borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  });

  const balance = selected ? totalBalance(selected) : 0;
  // Agency groups with a PO leave with the bill open.
  const onAgencyCredit = Boolean(selected) && billRooms.every(canStayOnAgencyCredit);
  const checkoutBlocked = balance > 0 && !onAgencyCredit;
  const billTotal = billRooms.reduce((sum, room) => sum + Number(room.totalAmount || 0) + Number(room.extraCharges || 0), 0);
  const lineItems = selected && Array.isArray(selected.extraChargeItems) ? selected.extraChargeItems : [];
  const otherExtras = selected ? Math.max(0, Number(selected.extraCharges || 0) - lineItems.reduce((s, i) => s + Number(i.amount || 0), 0)) : 0;

  return (
    <PageLayout>
      <div style={{ fontFamily: SANS, background: BG, minHeight: '100vh', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <button type="button" onClick={backToReservations}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 10, fontFamily: 'inherit' }}>
              <i className="ti ti-arrow-left" aria-hidden="true" /> {cameFromReservations ? 'Back to reservation' : 'Reservations'}
            </button>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Billing</h2>
            <p style={{ fontSize: 12.5, color: SUBTEXT, margin: '3px 0 0' }}>Pick a guest, add anything they used, take payment, then check them out.</p>
          </div>
        </div>

        {success && (
          <div role="status" style={{ background: OK_BG, color: OK_TEXT, padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span>{success}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setSuccess('')} style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', fontSize: 15 }}>×</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 20, alignItems: 'start' }}>
          {/* ── Guests with an open bill ── */}
          <div style={{ ...card, padding: 14, position: 'sticky', top: 76 }}>
            <div style={{ fontWeight: 700, color: TEXT, fontSize: 13, marginBottom: 10 }}>Open bills ({shownReservations.length})</div>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search guest, room, phone or #ref" aria-label="Search reservations"
              style={{ ...inp, width: '100%', marginBottom: 8 }} />
            <SortControls sortBy={sortBy} sortDir={sortDir} onSortBy={setSortBy} onSortDir={setSortDir}
              style={{ ...inp, padding: '7px 8px', fontSize: 12 }} />
            <div style={{ marginTop: 10, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', display: 'grid', gap: 6 }}>
              {shownReservations.length === 0 ? (
                <p style={{ color: MUTED, fontSize: 13, padding: '12px 0' }}>{reservations.length === 0 ? 'No open bills.' : 'No guests match your search.'}</p>
              ) : shownReservations.map(r => {
                const owes = totalBalance(r);
                const active = selected?.id === r.id;
                return (
                  <button type="button" key={r.id} onClick={() => selectReservation(r)}
                    style={{ textAlign: 'left', border: `1px solid ${active ? ACCENT : BORDER}`, background: active ? SELECTED : CARD2, borderRadius: 10, padding: '10px 11px', cursor: 'pointer', fontFamily: SANS }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.guestName || 'Guest'}</span>
                      {statusPill(r.status)}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, margin: '3px 0 6px' }}>
                      {roomsText(r)} · {formatDate(r.checkIn)}{r.checkOut && r.checkOut !== r.checkIn ? ` → ${formatDate(r.checkOut)}` : ''}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: SUBTEXT }}>{owes > 0 ? (isAgencyBilled(r) ? 'Due from agency' : 'Still owes') : 'Paid in full'}</span>
                      <span style={{ ...money, fontWeight: 700, color: owes > 0 ? RED : GREEN }}>{formatCurrency(Math.max(0, owes))}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── The selected guest's bill ── */}
          <div>
            {!selected ? (
              <div style={{ ...card, padding: 40, textAlign: 'center', color: MUTED, borderStyle: 'dashed' }}>
                <i className="ti ti-receipt" aria-hidden="true" style={{ fontSize: 30, display: 'block', marginBottom: 8 }} />
                Select a guest on the left to see their bill.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {/* Summary */}
                <div style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 18, color: TEXT }}>{selected.guestName}</h3>
                      {statusPill(selected.status)}
                      {isAgencyBilled(selected) && (
                        <span style={{ background: dark ? '#312e81' : '#e0e7ff', color: dark ? '#c7d2fe' : '#3730a3', borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <i className="ti ti-building-bank" aria-hidden="true" /> {agencyStatusLabel(selected)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: SUBTEXT, marginTop: 4 }}>
                      {selected.cottageOnly ? 'Cottage-only tour' : isGroupBill ? `${billRooms.length} rooms booked together: ${billRooms.map(room => room.roomNumber || '—').join(', ')}` : `Room ${selected.roomNumber || '—'}${selected.roomType ? ` · ${selected.roomType}` : ''}`}
                      {' · '}{formatDate(selected.checkIn)}{selected.checkInTime ? ` ${selected.checkInTime}` : ''}
                      {selected.checkOut && selected.checkOut !== selected.checkIn ? ` → ${formatDate(selected.checkOut)}` : ''}{selected.checkOutTime ? ` (out ${selected.checkOutTime})` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Booking #{selected.id.slice(0, 8).toUpperCase()}{selected.phone ? ` · ${selected.phone}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: SUBTEXT, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{balance > 0 ? (isAgencyBilled(selected) ? 'Due from agency' : 'Balance due') : 'Paid in full'}</div>
                    <div style={{ ...money, fontSize: 28, fontWeight: 800, color: balance > 0 ? RED : GREEN }}>{formatCurrency(Math.max(0, balance))}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
                  {/* The bill */}
                  <div style={card}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 12 }}><i className="ti ti-file-invoice" aria-hidden="true" /> Bill</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {isGroupBill ? billRooms.map(room => {
                        const items = Array.isArray(room.extraChargeItems) ? room.extraChargeItems : [];
                        const other = Math.max(0, Number(room.extraCharges || 0) - items.reduce((sum, i) => sum + Number(i.amount || 0), 0));
                        return (
                          <React.Fragment key={room.id}>
                            <Receipt label={`Room ${room.roomNumber || '—'}${room.id === selected.id ? ' (room, guests, cottage)' : ''}`} value={formatCurrency(room.totalAmount)} />
                            {items.map(item => <Receipt key={item.id || item.description} label={`  ${item.description}`} value={formatCurrency(item.amount)} />)}
                            {other > 0.004 && <Receipt label="  Other charges" value={formatCurrency(other)} />}
                          </React.Fragment>
                        );
                      }) : (
                        <>
                          <Receipt label={selected.cottageOnly ? 'Entrance + cottage' : 'Booking (room, guests, cottage)'} value={formatCurrency(selected.totalAmount)} />
                          {lineItems.map(item => <Receipt key={item.id || item.description} label={item.description} value={formatCurrency(item.amount)} />)}
                          {otherExtras > 0.004 && <Receipt label="Other charges" value={formatCurrency(otherExtras)} />}
                        </>
                      )}
                      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                        <Receipt label="Total" value={formatCurrency(billTotal)} strong />
                      </div>
                      <Receipt label="Paid so far" value={`− ${formatCurrency(totalPaid(selected))}`} />
                      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                        <Receipt label={balance > 0 ? 'Balance due' : 'Balance'} value={formatCurrency(Math.max(0, balance))} strong />
                      </div>
                      {(() => {
                        const vat = getVatBreakdown(billTotal);
                        return <div style={{ fontSize: 11, color: MUTED }}>Prices include 12% VAT ({formatCurrency(vat.vat)}); net of VAT {formatCurrency(vat.net)}.</div>;
                      })()}
                    </div>
                  </div>

                  {(selected.type === 'corporate' || isAgencyBilled(selected)) && (
                    <AgencyBillingCard reservation={selected} onSaved={text => { setSuccess(text); fetchReservations(); }}
                      t={{ card, inp, btn, TEXT, SUBTEXT, GREEN, RED, ACCENT_LINK: dark ? '#bef264' : '#2f6b3a' }} />
                  )}

                  {/* 1 · Add to the bill */}
                  <div style={card}>
                    {stepTitle(1, 'Add to the bill', isGroupBill ? `Anything the guest used during the stay. Added to Room ${selected.roomNumber || ''}'s line.` : 'Anything the guest used during the stay.')}
                    <div style={{ display: 'grid', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: SUBTEXT }}>Extra charge</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={extraCharge.description} onChange={e => setExtraCharge({ ...extraCharge, description: e.target.value })}
                          placeholder="e.g. Food, laundry, damage" style={{ ...inp, flex: 1, minWidth: 0 }} />
                        <input type="number" value={extraCharge.amount} onChange={e => setExtraCharge({ ...extraCharge, amount: e.target.value })}
                          placeholder="₱" style={{ ...inp, width: 90 }} />
                        <button type="button" onClick={handleAddExtra} disabled={billingBusy || !extraCharge.description || !extraCharge.amount} style={{ ...btn(), opacity: !extraCharge.description || !extraCharge.amount ? 0.6 : 1 }}>Add</button>
                      </div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: SUBTEXT, marginTop: 6 }}>Service from the rate card</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={service.serviceId} aria-label="Service"
                          onChange={e => setService({ serviceId: e.target.value, hours: e.target.value === 'spa' ? 1 : 4, persons: 5 })}
                          style={{ ...inp, flex: '1 1 150px' }}>
                          {SERVICES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                        <input type="number" aria-label="Hours" title="Hours" min={service.serviceId === 'spa' ? 1 : 4} max={selectedService?.maxHours} value={service.hours}
                          onChange={e => setService(prev => ({ ...prev, hours: e.target.value }))} style={{ ...inp, width: 70 }} />
                        {service.serviceId === 'photoshoot' && (
                          <input type="number" aria-label="People" title="People" min="1" max={selectedService?.maxPersons} value={service.persons}
                            onChange={e => setService(prev => ({ ...prev, persons: e.target.value }))} style={{ ...inp, width: 70 }} />
                        )}
                        <button type="button" onClick={handleAddService} disabled={billingBusy || !servicePrice || Boolean(servicePrice.error)} style={btn()}>
                          Add {servicePrice && !servicePrice.error ? formatCurrency(servicePrice.amount) : ''}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: servicePrice?.error ? RED : MUTED }}>
                        {servicePrice?.error || `${selectedService?.summary || ''} ${service.serviceId === 'photoshoot' ? '(hours, people)' : '(hours)'}`}
                      </div>
                    </div>
                    {!selected.cottageOnly && selected.type !== 'corporate' && ['pending', 'confirmed', 'checked-in'].includes(selected.status) && (() => {
                      const room = billRooms.find(r => r.id === guestEdit.roomId) || selected;
                      return (
                        <div style={{ display: 'grid', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: SUBTEXT }}>Extra guests</label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {isGroupBill && (
                              <select value={room.id} aria-label="Room" onChange={e => setGuestEdit({ roomId: e.target.value, adults: '', children: '' })} style={{ ...inp, flex: '1 1 120px' }}>
                                {billRooms.map(r => <option key={r.id} value={r.id}>Room {r.roomNumber}</option>)}
                              </select>
                            )}
                            <input type="number" min="1" aria-label="Adults" title="Adults"
                              value={guestEdit.adults === '' ? Number(room.adults || 0) : guestEdit.adults}
                              onChange={e => setGuestEdit(g => ({ ...g, roomId: room.id, adults: e.target.value }))} style={{ ...inp, width: 70 }} />
                            <span style={{ fontSize: 11, color: MUTED }}>adults</span>
                            <input type="number" min="0" aria-label="Children" title="Children (under 10)"
                              value={guestEdit.children === '' ? Number(room.children || 0) : guestEdit.children}
                              onChange={e => setGuestEdit(g => ({ ...g, roomId: room.id, children: e.target.value }))} style={{ ...inp, width: 70 }} />
                            <span style={{ fontSize: 11, color: MUTED }}>children</span>
                            <button type="button" onClick={handleExtraGuests} disabled={billingBusy} style={btn()}>Update</button>
                          </div>
                          <div style={{ fontSize: 11, color: MUTED }}>Uses the room's extra-guest rate per {room.bookingType === 'daytour' ? 'day' : 'night'} and its guest limit. You'll see the charge before it's added.</div>
                        </div>
                      );
                    })()}
                    <PromoCodeForm
                      reservation={selected}
                      colors={{ TEXT, SUBTEXT, MUTED, BORDER, RED }}
                      inp={inp}
                      btn={btn}
                      onApplied={result => {
                        setSuccess(`Promo ${result.code} (${result.label}): −${formatCurrency(result.discount)}.`);
                      }}
                    />
                    <SeniorPwdDiscountForm
                      reservation={selected}
                      colors={{ TEXT, SUBTEXT, MUTED, BORDER, RED }}
                      inp={inp}
                      btn={btn}
                      onApplied={result => {
                        setSuccess(`${result.label}: −${formatCurrency(result.discount)}.`);
                      }}
                    />
                  </div>
                </div>

                {/* 2 · Take payment */}
                <div style={card}>
                  {stepTitle(2, 'Take payment', balance > 0
                    ? (['pending', 'confirmed'].includes(selected.status) ? 'Paying the full balance on the stay date checks the guest in automatically.' : 'Collect what the guest still owes.')
                    : 'Nothing is owed right now.')}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    <input type="number" value={paymentAmount} onChange={e => { setPaymentAmount(e.target.value); setStatusResult(''); }}
                      placeholder="Amount (₱)" aria-label="Amount" style={{ ...inp, flex: '1 1 160px', fontSize: 15, fontWeight: 700 }} />
                    {balance > 0 && (
                      <button type="button" onClick={() => { setPaymentAmount(String(Math.round(balance * 100) / 100)); setStatusResult(''); }} style={btn()}>
                        Full balance {formatCurrency(balance)}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                    <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, marginBottom: 2 }}><i className="ti ti-cash" aria-hidden="true" /> Paid here at the desk</div>
                      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Cash, GCash or QR scanned at the counter. No card terminal.</div>
                      <select value={deskMethod} onChange={e => setDeskMethod(e.target.value)} aria-label="Payment method" style={{ ...inp, width: '100%', marginBottom: 8 }}>
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                        <option value="qrph">QR payment (QR Ph)</option>
                      </select>
                      <input value={paperReceiptNo} onChange={e => setPaperReceiptNo(e.target.value)} maxLength={40}
                        placeholder="Paper receipt no. (only if you wrote one)" aria-label="Paper receipt number"
                        title="If you also hand the guest a paper receipt, type its number so the two can be matched later"
                        style={{ ...inp, width: '100%', marginBottom: 8 }} />
                      <button type="button" onClick={handlePayment} disabled={!paymentAmount || billingBusy}
                        style={{ ...btn('green'), width: '100%', opacity: paymentAmount ? 1 : 0.5 }}>
                        {billingBusy ? 'Saving…' : `Record ${deskMethod === 'cash' ? 'cash' : deskMethod === 'gcash' ? 'GCash' : 'QR'} payment${paymentAmount ? ` of ${formatCurrency(paymentAmount)}` : ''}`}
                      </button>
                    </div>
                    <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, marginBottom: 2 }}><i className="ti ti-qrcode" aria-hidden="true" /> Pay online (scan or send a link)</div>
                      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>The guest pays on their own phone by QR Ph, GCash, Maya, GrabPay or card. Make the link, then let them scan the QR code on this screen, or copy the link and send it by chat or text.</div>
                      {!payLink ? (
                        <button type="button" onClick={handleGeneratePayMongoLink} disabled={payLinkLoading || !paymentAmount || Number(paymentAmount) <= 0}
                          style={{ ...btn('brass'), width: '100%', opacity: payLinkLoading || !paymentAmount ? 0.5 : 1 }}>
                          {payLinkLoading ? 'Making the link…' : 'Make a payment link'}
                        </button>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {payQr && (
                            <div style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: 12, background: '#fff', borderRadius: 10, border: `1px solid ${BORDER}` }}>
                              <img src={payQr} alt="QR code of the payment link" width={200} height={200} style={{ display: 'block' }} />
                              <div style={{ fontSize: 11.5, color: '#374151', textAlign: 'center', fontWeight: 600 }}>
                                Guest: scan with your phone camera to pay {formatCurrency(paymentAmount)}
                              </div>
                              <div style={{ fontSize: 10.5, color: '#6b7280', textAlign: 'center' }}>Waiting for payment… this updates by itself.</div>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input readOnly value={payLink} onFocus={e => e.target.select()} style={{ ...inp, flex: 1, minWidth: 0, fontSize: 11, color: SUBTEXT }} />
                            <button type="button" onClick={copyPayLink} style={btn()}>Copy</button>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => window.open(payLink, '_blank', 'noopener,noreferrer')} style={{ ...btn(), flex: 1 }}>Open</button>
                            <button type="button" onClick={handleCheckStatus} disabled={statusChecking} style={{ ...btn('green'), flex: 2, opacity: statusChecking ? 0.6 : 1 }}>
                              {statusChecking ? 'Checking…' : 'Has the guest paid?'}
                            </button>
                          </div>
                          {statusResult === 'unpaid' && <div style={{ fontSize: 11, color: SUBTEXT }}>Not paid yet. The guest hasn't finished paying.</div>}
                          {statusResult === 'expired' && <div style={{ fontSize: 11, color: RED }}>This link has expired. Make a new one.</div>}
                        </div>
                      )}
                      <PhoneDisplayToggle url={payLink} amount={Number(paymentAmount) || 0} guestName={selected?.guestName || ''} sessionId={checkoutSessionId}
                        colors={{ TEXT, MUTED: SUBTEXT, BORDER }} />
                      {payLinkError && <div style={{ marginTop: 8, fontSize: 11.5, color: RED }}>{payLinkError}</div>}
                      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>Online payments appear here by themselves. If the guest says they paid, press "Has the guest paid?".</div>
                    </div>
                  </div>
                </div>

                {/* 3 · Check out */}
                <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    {stepTitle(3, isGroupBill ? 'Check out all rooms' : 'Check out', selected.status === 'checked-in'
                      ? (checkoutBlocked ? 'Collect the balance first.' : onAgencyCredit && balance > 0 ? `The bill stays open as Due from agency (PO ${selected.agencyBilling.poNumber}).` : `When the guest returns the key and leaves${selected.checkOutTime ? ` (check-out time ${selected.checkOutTime})` : ''}.`)
                      : 'Only for guests who are checked in.')}
                  </div>
                  <button type="button" onClick={confirmAndCheckout} disabled={selected.status !== 'checked-in' || checkoutBlocked}
                    style={{ ...btn('primary'), padding: '11px 20px', opacity: selected.status !== 'checked-in' || checkoutBlocked ? 0.5 : 1, cursor: selected.status !== 'checked-in' || checkoutBlocked ? 'not-allowed' : 'pointer' }}>
                    <i className="ti ti-logout" aria-hidden="true" /> Check out guest
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
