import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { createPayMongoCheckout, checkPayMongoCheckoutStatus } from '../../lib/paymongo';

// NOTE: checkPayMongoCheckoutStatus is a new import. It needs a matching
// backend function that fetches the checkout session from PayMongo's API
// (GET /checkout_sessions/{id}) using your secret key server-side, and
// returns something like { status: 'paid' | 'unpaid' | 'expired', amountPaid }.
// This exists specifically so payment confirmation doesn't depend on the
// webhook firing — it asks PayMongo directly, on demand.

export default function Billing() {
  const { settings, formatCurrency, formatDate } = useSettings();
  const dark = settings?.darkMode;

  // ── Ledger palette ─────────────────────────────────────────
  const PAPER    = dark ? '#0E1712' : '#F7F5EF';
  const INK      = dark ? '#EDEBE3' : '#1B2B22';
  const SUBINK   = dark ? '#A9B4AC' : '#5B6660';
  const MUTED    = dark ? '#6F7A73' : '#9A9E96';
  const LINE     = dark ? '#26332C' : '#DAD5C7';
  const SURFACE  = dark ? '#152019' : '#FFFFFF';
  const SURFACE2 = dark ? '#1B281F' : '#F1EEE4';
  const SELECTED = dark ? '#233A2A' : '#EFEEE0';
  const BRASS    = '#A67C3D';
  const BRASS_TEXT = '#221604';
  const LEDGER_GREEN = dark ? '#8FCB9B' : '#2F5233';
  const BRICK    = dark ? '#E0A0A0' : '#9C3B3B';
  const OK_BG    = dark ? '#1E3324' : '#E8F0E5';

  const SANS = "'Poppins', sans-serif";
  const MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";

  const [reservations, setReservations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [extraCharge, setExtraCharge] = useState({ description: '', amount: '' });
  const [paymentAmount, setPaymentAmount] = useState('');
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
      .filter(r => r.status !== 'cancelled' && r.status !== 'checked-out'));
  };

  useEffect(() => { fetchReservations(); }, []);

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

  const totalPaid = (r) => Number(r.amountPaid || 0);
  const totalBalance = (r) => Number(r.totalAmount || 0) + Number(r.extraCharges || 0) - totalPaid(r);

  const selectReservation = (r) => {
    setSelected(r);
    setSuccess('');
    setPayLink('');
    setCheckoutSessionId('');
    setPayLinkError('');
    setStatusResult('');
  };

  const handleAddExtra = async () => {
    if (!extraCharge.description || !extraCharge.amount) return;
    const newExtra = Number(selected.extraCharges || 0) + Number(extraCharge.amount);
    await updateDoc(doc(db, 'reservations', selected.id), { extraCharges: newExtra });
    setExtraCharge({ description: '', amount: '' });
    fetchReservations();
    setSelected(prev => ({ ...prev, extraCharges: newExtra }));
    setSuccess('Extra charge added.');
  };

  // Shared crediting logic so cash and reconciled-online payments post the
  // same way: bump amountPaid, flip status, and log a row in /payments.
  const creditPayment = async (amount, method) => {
    const newPaid = totalPaid(selected) + Number(amount);
    const balance = Number(selected.totalAmount || 0) + Number(selected.extraCharges || 0) - newPaid;
    const paymentStatus = balance <= 0 ? 'paid' : 'partial';
    await updateDoc(doc(db, 'reservations', selected.id), {
      amountPaid: newPaid,
      paymentStatus,
    });
    await addDoc(collection(db, 'payments'), {
      reservationId: selected.id,
      guestName: selected.guestName,
      roomNumber: selected.roomNumber,
      amount: Number(amount),
      method,
      createdAt: serverTimestamp(),
    });
    fetchReservations();
    setSelected(prev => ({ ...prev, amountPaid: newPaid, paymentStatus }));
    return { newPaid, paymentStatus };
  };

  const handlePayment = async () => {
    if (!paymentAmount) return;
    await creditPayment(paymentAmount, selected.paymentMethod || 'cash');
    setPaymentAmount('');
    setSuccess(`Payment of ${formatCurrency(paymentAmount)} recorded.`);
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
        guestName: selected.guestName,
        guestEmail: selected.guestEmail,
        description: `Room ${selected.roomNumber} — ${selected.guestName}`,
        amount: Number(paymentAmount),
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
      const { status, amountPaid } = await checkPayMongoCheckoutStatus(checkoutSessionId);
      setStatusResult(status);
      if (status === 'paid') {
        await creditPayment(amountPaid ?? paymentAmount, 'paymongo');
        setSuccess(`Confirmed with PayMongo — ${formatCurrency(amountPaid ?? paymentAmount)} recorded.`);
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

  const copyPayLink = async () => {
    try {
      await navigator.clipboard.writeText(payLink);
      setSuccess('Payment link copied.');
    } catch {
      // Clipboard permission denied — the link is still visible/selectable in the field.
    }
  };

  const handleCheckout = async () => {
    if (totalBalance(selected) > 0) return alert('Guest still has a balance. Settle it before checkout.');
    await updateDoc(doc(db, 'reservations', selected.id), { status: 'checked-out' });
    if (selected.roomId) {
      await updateDoc(doc(db, 'rooms', selected.roomId), { status: 'vacant' });
    }
    setSelected(null);
    fetchReservations();
    setSuccess('Guest checked out.');
  };

  const inp = {
    border: `1px solid ${LINE}`, borderRadius: '6px', padding: '9px 12px',
    fontSize: '13px', fontFamily: SANS,
    background: dark ? '#0E1712' : '#FFFFFF', color: INK, outline: 'none', boxSizing: 'border-box',
  };

  const money = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

  const Receipt = ({ label, value, strong }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <span style={{ color: strong ? INK : SUBINK, fontSize: strong ? '13px' : '12.5px', fontWeight: strong ? 600 : 400 }}>
        {label}
      </span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${LINE}`, marginBottom: '3px' }} />
      <span style={{ ...money, color: strong ? undefined : INK, fontSize: strong ? '16px' : '13px', fontWeight: strong ? 700 : 500 }}>
        {value}
      </span>
    </div>
  );

  return (
    <PageLayout>
      <div style={{ fontFamily: SANS, background: PAPER, minHeight: '100vh', padding: '28px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: INK, marginBottom: '4px' }}>Billing</h2>
        <p style={{ fontSize: '12.5px', color: SUBINK, marginBottom: '20px' }}>Reservation charges and payment records.</p>

        {success && (
          <div style={{ background: OK_BG, color: LEDGER_GREEN, padding: '10px 14px', borderRadius: '8px', marginBottom: '18px', fontSize: '13px', border: `1px solid ${LINE}` }}>
            {success}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px' }}>
          {/* Reservation list — plain list, not cards */}
          <div>
            <h3 style={{ fontWeight: '600', color: SUBINK, fontSize: '12px', margin: '0 0 10px', textTransform: 'none' }}>Active reservations</h3>
            {reservations.length === 0 ? (
              <p style={{ color: MUTED, fontSize: '13px', padding: '12px 0' }}>No active reservations.</p>
            ) : (
              <div style={{ borderTop: `1px solid ${LINE}` }}>
                {reservations.map(r => (
                  <div key={r.id} onClick={() => selectReservation(r)}
                    style={{
                      padding: '11px 10px', borderBottom: `1px solid ${LINE}`, cursor: 'pointer',
                      background: selected?.id === r.id ? SELECTED : 'transparent',
                      borderLeft: selected?.id === r.id ? `3px solid ${BRASS}` : '3px solid transparent',
                    }}>
                    <p style={{ fontWeight: '600', fontSize: '13px', color: INK, margin: 0 }}>{r.guestName}</p>
                    <p style={{ fontSize: '11px', color: MUTED, margin: '2px 0 6px' }}>
                      Room {r.roomNumber} · {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: SUBINK }}>Balance</span>
                      <span style={{ ...money, fontSize: '12px', fontWeight: '700', color: totalBalance(r) > 0 ? BRICK : LEDGER_GREEN }}>
                        {formatCurrency(totalBalance(r))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div>
            {!selected ? (
              <div style={{ padding: '40px', textAlign: 'center', color: MUTED, border: `1px dashed ${LINE}`, borderRadius: '10px' }}>
                Select a reservation to manage billing.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                {/* Receipt-style summary */}
                <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: '10px', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
                    <h3 style={{ fontWeight: '700', color: INK, margin: 0, fontSize: '15px' }}>{selected.guestName}</h3>
                    <span style={{ fontSize: '12px', color: SUBINK }}>Room {selected.roomNumber} · {selected.roomType}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    <Receipt label="Room charge" value={formatCurrency(selected.totalAmount)} />
                    <Receipt label="Extra charges" value={formatCurrency(selected.extraCharges || 0)} />
                    <Receipt label="Paid to date" value={`− ${formatCurrency(totalPaid(selected))}`} />
                    <div style={{ borderTop: `1px solid ${LINE}`, marginTop: '4px', paddingTop: '10px' }}>
                      <Receipt label="Balance due" value={formatCurrency(totalBalance(selected))} strong />
                    </div>
                  </div>
                </div>

                {/* Extra charge */}
                <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: '10px', padding: '18px 24px' }}>
                  <h3 style={{ fontWeight: '600', color: INK, marginBottom: '12px', fontSize: '13px' }}>Add extra charge</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input value={extraCharge.description}
                      onChange={e => setExtraCharge({ ...extraCharge, description: e.target.value })}
                      placeholder="Description (e.g. F&B, laundry)"
                      style={{ ...inp, flex: 1 }} />
                    <input type="number" value={extraCharge.amount}
                      onChange={e => setExtraCharge({ ...extraCharge, amount: e.target.value })}
                      placeholder="Amount"
                      style={{ ...inp, width: '120px' }} />
                    <button onClick={handleAddExtra}
                      style={{ background: SURFACE2, color: INK, border: `1px solid ${LINE}`, borderRadius: '6px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: SANS }}>
                      Add
                    </button>
                  </div>
                </div>

                {/* Payment — two clearly separate lanes */}
                <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: '10px', padding: '18px 24px' }}>
                  <h3 style={{ fontWeight: '600', color: INK, marginBottom: '14px', fontSize: '13px' }}>Accept payment</h3>
                  <input type="number" value={paymentAmount}
                    onChange={e => { setPaymentAmount(e.target.value); setStatusResult(''); }}
                    placeholder="Amount"
                    style={{ ...inp, width: '100%', marginBottom: '16px' }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '20px' }}>
                    {/* Cash lane */}
                    <div>
                      <p style={{ fontSize: '11px', color: SUBINK, margin: '0 0 8px', fontWeight: 600 }}>Cash</p>
                      <button onClick={handlePayment}
                        disabled={!paymentAmount}
                        style={{
                          width: '100%', background: LEDGER_GREEN, color: '#F7F5EF', border: 'none', borderRadius: '6px',
                          padding: '10px 14px', fontSize: '13px', fontWeight: '700', cursor: paymentAmount ? 'pointer' : 'default',
                          opacity: paymentAmount ? 1 : 0.5, fontFamily: SANS,
                        }}>
                        Record cash payment
                      </button>
                    </div>

                    <div style={{ background: LINE }} />

                    {/* Online lane */}
                    <div>
                      <p style={{ fontSize: '11px', color: SUBINK, margin: '0 0 8px', fontWeight: 600 }}>Online — GCash, Maya, GrabPay, card</p>

                      {!payLink ? (
                        <button
                          onClick={handleGeneratePayMongoLink}
                          disabled={payLinkLoading || !paymentAmount || Number(paymentAmount) <= 0}
                          style={{
                            width: '100%', background: BRASS, color: BRASS_TEXT, border: 'none', borderRadius: '6px',
                            padding: '10px 14px', fontSize: '13px', fontWeight: '700',
                            cursor: (payLinkLoading || !paymentAmount) ? 'default' : 'pointer',
                            opacity: (payLinkLoading || !paymentAmount || Number(paymentAmount) <= 0) ? 0.5 : 1,
                            fontFamily: SANS,
                          }}>
                          {payLinkLoading ? 'Generating…' : 'Generate payment link'}
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input readOnly value={payLink} onFocus={e => e.target.select()}
                              style={{ ...inp, flex: 1, color: SUBINK, fontSize: '11px' }} />
                            <button onClick={copyPayLink}
                              style={{ background: SURFACE2, color: INK, border: `1px solid ${LINE}`, borderRadius: '6px', padding: '9px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: SANS }}>
                              Copy
                            </button>
                          </div>
                          <button onClick={() => window.open(payLink, '_blank', 'noopener,noreferrer')}
                            style={{ background: 'transparent', color: SUBINK, border: `1px solid ${LINE}`, borderRadius: '6px', padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer', fontFamily: SANS }}>
                            Preview link
                          </button>

                          <button onClick={handleCheckStatus}
                            disabled={statusChecking}
                            style={{
                              background: LEDGER_GREEN, color: '#F7F5EF', border: 'none', borderRadius: '6px',
                              padding: '9px 12px', fontSize: '12px', fontWeight: '700', cursor: statusChecking ? 'default' : 'pointer',
                              opacity: statusChecking ? 0.6 : 1, fontFamily: SANS, marginTop: '4px',
                            }}>
                            {statusChecking ? 'Checking with PayMongo…' : 'Check payment status'}
                          </button>
                          {statusResult === 'unpaid' && (
                            <p style={{ fontSize: '11px', color: SUBINK, margin: 0 }}>Not paid yet — the guest hasn't completed checkout.</p>
                          )}
                          {statusResult === 'expired' && (
                            <p style={{ fontSize: '11px', color: BRICK, margin: 0 }}>This link has expired. Generate a new one.</p>
                          )}
                        </div>
                      )}

                      {payLinkError && (
                        <p style={{ marginTop: '8px', fontSize: '11.5px', color: BRICK }}>{payLinkError}</p>
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', color: MUTED, marginTop: '14px', lineHeight: 1.5 }}>
                    Balances update automatically when PayMongo's webhook confirms a payment. If a guest says they've paid but the balance hasn't moved, use "Check payment status" to confirm directly with PayMongo and post it manually.
                  </p>
                </div>

                <button onClick={handleCheckout}
                  style={{
                    width: '100%', background: INK, color: PAPER,
                    border: 'none', borderRadius: '8px', padding: '13px',
                    fontWeight: '700', fontSize: '13.5px', cursor: 'pointer', fontFamily: SANS,
                  }}>
                  Complete checkout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}