import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';

export default function BookingTransactions() {
  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [success, setSuccess] = useState('');

  const fetchReservations = async () => {
    const snap = await getDocs(collection(db, 'reservations'));
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status !== 'cancelled');
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setReservations(data);
  };

  useEffect(() => { fetchReservations(); }, []);

  const totalPaid = (r) => Number(r.amountPaid || 0);
  const totalBalance = (r) => Number(r.totalAmount || 0) + Number(r.extraCharges || 0) - totalPaid(r);

  const handlePayment = async () => {
    if (!paymentAmount || !selected) return;
    const newPaid = totalPaid(selected) + Number(paymentAmount);
    const balance = Number(selected.totalAmount || 0) - newPaid;
    const paymentStatus = balance <= 0 ? 'paid' : 'partial';
    await updateDoc(doc(db, 'reservations', selected.id), { amountPaid: newPaid, paymentStatus });
    await addDoc(collection(db, 'payments'), {
      reservationId: selected.id,
      guestName: selected.guestName,
      roomNumber: selected.roomNumber,
      amount: Number(paymentAmount),
      method: paymentMethod,
      createdAt: serverTimestamp(),
    });
    setSuccess(`Payment of ₱${Number(paymentAmount).toLocaleString()} recorded!`);
    setPaymentAmount('');
    fetchReservations();
    setSelected(prev => ({ ...prev, amountPaid: newPaid, paymentStatus }));
  };

  const filtered = reservations.filter(r =>
    r.guestName?.toLowerCase().includes(search.toLowerCase()) ||
    r.roomNumber?.includes(search)
  );

  const statusStyle = (s) => {
    const map = { paid: { bg: '#dcfce7', color: '#16a34a' }, partial: { bg: '#fef9c3', color: '#a16207' }, pending: { bg: '#fee2e2', color: '#dc2626' } };
    return map[s] || { bg: '#f3f4f6', color: '#6b7280' };
  };

  const S = {
    card: { background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', fontFamily: "'Poppins', sans-serif" },
    th: { textAlign: 'left', fontSize: '11px', color: '#9ca3af', fontWeight: '500', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' },
    td: { padding: '12px 16px', fontSize: '12px', color: '#111', borderBottom: '1px solid #f9fafb', verticalAlign: 'middle' },
  };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif" }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111', marginBottom: '20px' }}>Booking Transactions</h2>

        {success && (
          <div style={{ background: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', fontWeight: '500' }}>
            ✅ {success}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
          {/* Reservations Table */}
          <div style={S.card}>
            <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by guest or room..."
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Guest</th>
                  <th style={S.th}>Room</th>
                  <th style={S.th}>Total</th>
                  <th style={S.th}>Paid</th>
                  <th style={S.th}>Balance</th>
                  <th style={S.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '12px' }}>No transactions found.</td></tr>
                ) : (
                  filtered.map(r => {
                    const bal = totalBalance(r);
                    const st = statusStyle(r.paymentStatus);
                    return (
                      <tr key={r.id} onClick={() => { setSelected(r); setSuccess(''); }}
                        style={{ cursor: 'pointer', background: selected?.id === r.id ? '#f9fafb' : 'transparent', borderLeft: selected?.id === r.id ? '3px solid #d4f550' : '3px solid transparent' }}>
                        <td style={S.td}>
                          <div style={{ fontWeight: '600' }}>{r.guestName}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{r.phone}</div>
                        </td>
                        <td style={S.td}>Room {r.roomNumber}</td>
                        <td style={S.td}>₱{Number(r.totalAmount || 0).toLocaleString()}</td>
                        <td style={{ ...S.td, color: '#16a34a', fontWeight: '600' }}>₱{totalPaid(r).toLocaleString()}</td>
                        <td style={{ ...S.td, color: bal > 0 ? '#dc2626' : '#16a34a', fontWeight: '600' }}>₱{bal.toLocaleString()}</td>
                        <td style={S.td}>
                          <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '600', textTransform: 'capitalize' }}>
                            {r.paymentStatus || 'pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Payment Panel */}
          <div>
            {!selected ? (
              <div style={{ ...S.card, padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                Select a reservation to process payment
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Summary */}
                <div style={{ ...S.card, padding: '20px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', marginBottom: '14px' }}>{selected.guestName}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Room {selected.roomNumber} · {selected.checkIn} → {selected.checkOut}</div>
                  <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '14px', paddingTop: '14px' }}>
                    {[
                      { label: 'Total Amount', value: `₱${Number(selected.totalAmount || 0).toLocaleString()}` },
                      { label: 'Extra Charges', value: `₱${Number(selected.extraCharges || 0).toLocaleString()}` },
                      { label: 'Amount Paid', value: `₱${totalPaid(selected).toLocaleString()}`, color: '#16a34a' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                        <span style={{ color: '#6b7280' }}>{row.label}</span>
                        <span style={{ fontWeight: '600', color: row.color || '#111' }}>{row.value}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700', borderTop: '1px solid #f3f4f6', paddingTop: '10px', marginTop: '4px' }}>
                      <span>Balance Due</span>
                      <span style={{ color: totalBalance(selected) > 0 ? '#dc2626' : '#16a34a' }}>
                        ₱{totalBalance(selected).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment form */}
                <div style={{ ...S.card, padding: '20px' }}>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: '#111', marginBottom: '14px' }}>Accept Payment</div>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Amount</label>
                    <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                      placeholder="Enter amount"
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                      <option value="cash">Cash</option>
                      <option value="gcash">GCash</option>
                      <option value="card">Card</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                  </div>
                  <button onClick={handlePayment}
                    style={{ width: '100%', background: '#1a2420', color: '#d4f550', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Record Payment
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