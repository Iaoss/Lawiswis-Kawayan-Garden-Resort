import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { createPayMongoCheckout } from '../../lib/paymongo';

export default function Billing() {
  const { settings, formatCurrency, formatDate } = useSettings();
  const dark = settings?.darkMode;

  const ACCENT      = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f9fafb';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const RED     = dark ? '#fca5a5' : '#dc2626';
  const GREEN   = dark ? '#86efac' : '#16a34a';
  const SUCCESS_BG   = dark ? '#14532d' : '#dcfce7';
  const SUCCESS_TEXT = dark ? '#86efac' : '#15803d';
  const SELECTED_BG  = dark ? '#1e3a5f' : '#eff6ff';
  const HOVER_BG      = dark ? '#242422' : '#eff6ff';
  const PAYMONGO_BLUE = '#0b8de5';

  const [reservations, setReservations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [extraCharge, setExtraCharge] = useState({ description: '', amount: '' });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [success, setSuccess] = useState('');

  // ── PayMongo payment link ──────────────────────────────────
  const [payLink, setPayLink] = useState('');
  const [payLinkLoading, setPayLinkLoading] = useState(false);
  const [payLinkError, setPayLinkError] = useState('');

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
    setPayLinkError('');
  };

  const handleAddExtra = async () => {
    if (!extraCharge.description || !extraCharge.amount) return;
    const newExtra = Number(selected.extraCharges || 0) + Number(extraCharge.amount);
    await updateDoc(doc(db, 'reservations', selected.id), { extraCharges: newExtra });
    setExtraCharge({ description: '', amount: '' });
    fetchReservations();
    setSelected(prev => ({ ...prev, extraCharges: newExtra }));
    setSuccess('Extra charge added!');
  };

  const handlePayment = async () => {
    if (!paymentAmount) return;
    const newPaid = totalPaid(selected) + Number(paymentAmount);
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
      amount: Number(paymentAmount),
      method: selected.paymentMethod || 'cash',
      createdAt: serverTimestamp(),
    });
    setPaymentAmount('');
    fetchReservations();
    setSuccess(`Payment of ${formatCurrency(paymentAmount)} recorded!`);
    setSelected(prev => ({ ...prev, amountPaid: newPaid, paymentStatus }));
  };

  // Generates a PayMongo Checkout Session for the amount above and shows
  // the link — the guest pays on their own device (GCash, Maya, GrabPay
  // or card). We don't navigate staff's own browser there: the webhook
  // marks the reservation paid server-side once the guest completes it,
  // and the live listener above reflects that automatically.
  const handleGeneratePayMongoLink = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) return;
    setPayLinkLoading(true);
    setPayLinkError('');
    setPayLink('');
    try {
      const { checkoutUrl } = await createPayMongoCheckout({
        reservationId: selected.id,
        guestName: selected.guestName,
        guestEmail: selected.guestEmail,
        description: `Room ${selected.roomNumber} — ${selected.guestName}`,
        amount: Number(paymentAmount),
      });
      setPayLink(checkoutUrl);
    } catch (err) {
      setPayLinkError(err.message || 'Could not generate payment link. Please try again.');
    } finally {
      setPayLinkLoading(false);
    }
  };

  const copyPayLink = async () => {
    try {
      await navigator.clipboard.writeText(payLink);
      setSuccess('Payment link copied!');
    } catch {
      // Clipboard permission denied — the link is still visible/selectable in the field.
    }
  };

  const handleCheckout = async () => {
    if (totalBalance(selected) > 0) return alert('Guest still has a balance. Please settle before checkout.');
    await updateDoc(doc(db, 'reservations', selected.id), { status: 'checked-out' });
    setSelected(null);
    fetchReservations();
    setSuccess('Guest checked out successfully!');
  };

  const card = { background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)' };
  const inp = {
    border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '8px 12px',
    fontSize: '13px', fontFamily: "'Poppins', sans-serif",
    background: CARD2, color: TEXT, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: TEXT, marginBottom: '22px' }}>Billing</h2>
        {success && (
          <div style={{ background: SUCCESS_BG, color: SUCCESS_TEXT, padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>
            ✅ {success}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <div style={{ ...card, gridColumn: 'span 1', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: CARD2, borderBottom: `1px solid ${BORDER}` }}>
              <h3 style={{ fontWeight: '600', color: SUBTEXT, fontSize: '13px', margin: 0 }}>Active Reservations</h3>
            </div>
            {reservations.length === 0 ? (
              <p style={{ textAlign: 'center', color: MUTED, padding: '32px 0', fontSize: '13px' }}>No active reservations.</p>
            ) : (
              reservations.map(r => (
                <div key={r.id} onClick={() => selectReservation(r)}
                  style={{
                    padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer',
                    background: selected?.id === r.id ? SELECTED_BG : 'transparent',
                    borderLeft: selected?.id === r.id ? `4px solid ${ACCENT}` : '4px solid transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== r.id) e.currentTarget.style.background = HOVER_BG; }}
                  onMouseLeave={e => { if (selected?.id !== r.id) e.currentTarget.style.background = 'transparent'; }}>
                  <p style={{ fontWeight: '600', fontSize: '13px', color: TEXT, margin: 0 }}>{r.guestName}</p>
                  <p style={{ fontSize: '11px', color: MUTED, margin: '2px 0 0' }}>Room {r.roomNumber} · {formatDate(r.checkIn)} → {formatDate(r.checkOut)}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: MUTED }}>Balance:</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: totalBalance(r) > 0 ? RED : GREEN }}>
                      {formatCurrency(totalBalance(r))}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            {!selected ? (
              <div style={{ ...card, padding: '32px', textAlign: 'center', color: MUTED }}>
                Select a reservation to manage billing
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ ...card, padding: '22px' }}>
                  <h3 style={{ fontWeight: '600', color: TEXT, marginBottom: '14px', fontSize: '14px' }}>Bill Summary — {selected.guestName}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: SUBTEXT }}>Room {selected.roomNumber} ({selected.roomType})</span>
                      <span style={{ color: TEXT }}>{formatCurrency(selected.totalAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: SUBTEXT }}>Extra Charges</span>
                      <span style={{ color: TEXT }}>{formatCurrency(selected.extraCharges || 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: SUBTEXT }}>Amount Paid</span>
                      <span style={{ color: GREEN }}>- {formatCurrency(totalPaid(selected))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '15px', borderTop: `1px solid ${BORDER}`, paddingTop: '10px', marginTop: '4px' }}>
                      <span style={{ color: TEXT }}>Balance Due</span>
                      <span style={{ color: totalBalance(selected) > 0 ? RED : GREEN }}>
                        {formatCurrency(totalBalance(selected))}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ ...card, padding: '22px' }}>
                  <h3 style={{ fontWeight: '600', color: TEXT, marginBottom: '12px', fontSize: '14px' }}>Add Extra Charge</h3>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input value={extraCharge.description}
                      onChange={e => setExtraCharge({ ...extraCharge, description: e.target.value })}
                      placeholder="Description (e.g. F&B, Laundry)"
                      style={{ ...inp, flex: 1 }} />
                    <input type="number" value={extraCharge.amount}
                      onChange={e => setExtraCharge({ ...extraCharge, amount: e.target.value })}
                      placeholder="Amount"
                      style={{ ...inp, width: '128px' }} />
                    <button onClick={handleAddExtra}
                      style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                      Add
                    </button>
                  </div>
                </div>

                <div style={{ ...card, padding: '22px' }}>
                  <h3 style={{ fontWeight: '600', color: TEXT, marginBottom: '12px', fontSize: '14px' }}>Accept Payment</h3>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input type="number" value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      placeholder="Enter amount"
                      style={{ ...inp, flex: 1 }} />
                    <button onClick={handlePayment}
                      style={{ background: dark ? '#1e6b3a' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                      Record Cash Payment
                    </button>
                  </div>

                  {/* ── PayMongo payment link ── */}
                  <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: '16px', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: TEXT }}>Or send a payment link</span>
                    </div>
                    <p style={{ fontSize: '11px', color: MUTED, marginBottom: '10px', lineHeight: 1.5 }}>
                      Uses the amount above. The guest pays with GCash, Maya, GrabPay, or card on their own device — the balance here updates automatically once they pay.
                    </p>
                    <button
                      onClick={handleGeneratePayMongoLink}
                      disabled={payLinkLoading || !paymentAmount || Number(paymentAmount) <= 0}
                      style={{
                        background: PAYMONGO_BLUE, color: '#fff', border: 'none', borderRadius: '8px',
                        padding: '8px 18px', fontSize: '13px', fontWeight: '700',
                        cursor: (payLinkLoading || !paymentAmount) ? 'default' : 'pointer',
                        opacity: (payLinkLoading || !paymentAmount || Number(paymentAmount) <= 0) ? 0.55 : 1,
                        fontFamily: "'Poppins', sans-serif",
                      }}>
                      {payLinkLoading ? 'Generating…' : 'Generate Payment Link'}
                    </button>

                    {payLinkError && (
                      <div style={{ marginTop: '10px', fontSize: '12px', color: RED }}>{payLinkError}</div>
                    )}

                    {payLink && (
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                        <input readOnly value={payLink} onFocus={e => e.target.select()}
                          style={{ ...inp, flex: 1, color: SUBTEXT }} />
                        <button onClick={copyPayLink}
                          style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap' }}>
                          Copy
                        </button>
                        <button onClick={() => window.open(payLink, '_blank', 'noopener,noreferrer')}
                          style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap' }}>
                          Preview
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button onClick={handleCheckout}
                  style={{
                    width: '100%', background: dark ? '#f0f0f0' : '#1f2937',
                    color: dark ? '#111827' : '#fff',
                    border: 'none', borderRadius: '12px', padding: '14px',
                    fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                  }}>
                  Complete Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}