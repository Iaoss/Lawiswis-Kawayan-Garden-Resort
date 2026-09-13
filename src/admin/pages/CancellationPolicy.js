import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

export default function CancellationPolicy() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  const ACCENT      = settings?.accentColor || '#c8f06e';
  const ACCENT_TEXT = '#0a1a0a';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f9fafb';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#111827';
  const SUBTEXT = dark ? '#c7c7c0' : '#6b7280';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const SELECTED_BG = dark ? '#3a3320' : '#fffbeb';
  const DARKBTN_BG   = dark ? '#282827' : '#1a2420';
  const DARKBTN_TEXT = ACCENT;

  const SUCCESS_BG   = dark ? '#14532d' : '#dcfce7';
  const SUCCESS_TEXT = dark ? '#86efac' : '#16a34a';
  const GREEN = dark ? '#86efac' : '#16a34a';
  const RED   = dark ? '#fca5a5' : '#dc2626';

  const badge = (kind) => {
    const map = {
      green:  { dbg: '#14532d', dtext: '#86efac', lbg: '#dcfce7', ltext: '#16a34a' },
      blue:   { dbg: '#1e3a5f', dtext: '#93c5fd', lbg: '#dbeafe', ltext: '#1d4ed8' },
      yellow: { dbg: '#78350f', dtext: '#fde68a', lbg: '#fef9c3', ltext: '#a16207' },
      red:    { dbg: '#7f1d1d', dtext: '#fca5a5', lbg: '#fee2e2', ltext: '#dc2626' },
      gray:   { dbg: '#282827', dtext: '#9ca3af', lbg: '#f3f4f6', ltext: '#6b7280' },
    };
    const c = map[kind] || map.gray;
    return dark ? { background: c.dbg, color: c.dtext } : { background: c.lbg, color: c.ltext };
  };

  const [reservations, setReservations] = useState([]);
  const [policy, setPolicy] = useState({ moreThan7Days: 20, between4And7Days: 50, lessThan3Days: 100 });
  const [selected, setSelected] = useState(null);
  const [cancelResult, setCancelResult] = useState(null);
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [showPolicyEdit, setShowPolicyEdit] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const resSnap = await getDocs(collection(db, 'reservations'));
      const data = resSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.status !== 'cancelled' && r.status !== 'checked-out');
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReservations(data);

      const policySnap = await getDoc(doc(db, 'settings', 'cancellationPolicy'));
      if (policySnap.exists()) setPolicy(policySnap.data());
    };
    fetchData();
  }, []);

  const calculateFee = (reservation) => {
    if (!reservation.checkIn) return null;
    const today = new Date();
    const checkIn = new Date(reservation.checkIn);
    const daysBeforeCheckIn = Math.ceil((checkIn - today) / (1000 * 60 * 60 * 24));
    const totalAmount = Number(reservation.totalAmount || 0);
    let rate = 0;
    let tier = '';

    if (daysBeforeCheckIn > 7) {
      rate = policy.moreThan7Days;
      tier = 'More than 7 days before check-in';
    } else if (daysBeforeCheckIn >= 4) {
      rate = policy.between4And7Days;
      tier = '4–7 days before check-in';
    } else {
      rate = policy.lessThan3Days;
      tier = '3 days or less / same day';
    }

    const fee = (totalAmount * rate) / 100;
    const refund = totalAmount - fee;
    return { daysBeforeCheckIn, rate, fee, refund, tier, totalAmount };
  };

  const handleSelect = (r) => {
    setSelected(r);
    setSuccess('');
    setCancelResult(calculateFee(r));
  };

  const handleCancel = async () => {
    if (!selected || !cancelResult) return;
    await updateDoc(doc(db, 'reservations', selected.id), {
      status: 'cancelled',
      cancellationFee: cancelResult.fee,
      refundAmount: cancelResult.refund,
      cancelledAt: new Date().toISOString(),
    });
    setSuccess(`Reservation for ${selected.guestName} cancelled. Fee: ₱${cancelResult.fee.toLocaleString()} | Refund: ₱${cancelResult.refund.toLocaleString()}`);
    setSelected(null);
    setCancelResult(null);
    const resSnap = await getDocs(collection(db, 'reservations'));
    const data = resSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status !== 'cancelled' && r.status !== 'checked-out');
    setReservations(data);
  };

  const handleSavePolicy = async () => {
    await setDoc(doc(db, 'settings', 'cancellationPolicy'), policy);
    setShowPolicyEdit(false);
    setSuccess('Cancellation policy saved!');
  };

  const filtered = reservations.filter(r =>
    r.guestName?.toLowerCase().includes(search.toLowerCase()) ||
    r.roomNumber?.includes(search)
  );

  const statusBadgeKind = (s) => {
    const map = { confirmed: 'green', 'checked-in': 'blue', pending: 'yellow' };
    return map[s] || 'gray';
  };

  const S = {
    card: { background: CARD, borderRadius: '16px', border: `1px solid ${BORDER}`, fontFamily: "'Poppins', sans-serif", boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : 'none' },
    th: { textAlign: 'left', fontSize: '11px', color: MUTED, fontWeight: '500', padding: '12px 16px', borderBottom: `1px solid ${BORDER}` },
    td: { padding: '12px 16px', fontSize: '12px', color: TEXT, borderBottom: `1px solid ${BORDER}` },
  };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: TEXT, margin: 0 }}>Cancellation Processing</h2>
          <button onClick={() => setShowPolicyEdit(!showPolicyEdit)}
            style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: '10px', padding: '9px 18px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            ⚙️ Edit Policy
          </button>
        </div>

        {success && (
          <div style={{ background: SUCCESS_BG, color: SUCCESS_TEXT, padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', fontWeight: '500' }}>
            ✅ {success}
          </div>
        )}

        {/* Policy Editor */}
        {showPolicyEdit && (
          <div style={{ ...S.card, padding: '20px', marginBottom: '20px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT, marginBottom: '16px' }}>Cancellation Fee Policy</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '16px' }}>
              {[
                { label: 'More than 7 days', key: 'moreThan7Days', kind: 'green' },
                { label: '4–7 days before', key: 'between4And7Days', kind: 'yellow' },
                { label: '3 days or less', key: 'lessThan3Days', kind: 'red' },
              ].map(f => (
                <div key={f.key} style={{ ...badge(f.kind), borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>{f.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <input type="number" min="0" max="100" value={policy[f.key]}
                      onChange={e => setPolicy({ ...policy, [f.key]: Number(e.target.value) })}
                      style={{ width: '60px', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '8px', fontSize: '18px', fontWeight: '700', textAlign: 'center', fontFamily: "'Poppins', sans-serif", outline: 'none', background: dark ? 'rgba(0,0,0,0.25)' : '#fff', color: 'inherit' }} />
                    <span style={{ fontSize: '18px', fontWeight: '700' }}>%</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleSavePolicy}
              style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: '10px', padding: '10px 24px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              Save Policy
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
          {/* Reservation List */}
          <div style={S.card}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by guest name or room..."
                style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box', background: CARD2, color: TEXT }} />
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Guest</th>
                  <th style={S.th}>Room</th>
                  <th style={S.th}>Check-in</th>
                  <th style={S.th}>Total</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: MUTED, fontSize: '12px' }}>No active reservations.</td></tr>
                ) : (
                  filtered.map(r => {
                    const isSelected = selected?.id === r.id;
                    return (
                      <tr key={r.id} style={{ background: isSelected ? SELECTED_BG : 'transparent', borderLeft: isSelected ? `3px solid ${ACCENT}` : '3px solid transparent' }}>
                        <td style={S.td}>
                          <div style={{ fontWeight: '600' }}>{r.guestName}</div>
                          <div style={{ fontSize: '10px', color: MUTED }}>{r.phone}</div>
                        </td>
                        <td style={S.td}>
                          <div>Room {r.roomNumber}</div>
                          <div style={{ fontSize: '10px', color: MUTED }}>{r.roomType}</div>
                        </td>
                        <td style={S.td}>{r.checkIn}</td>
                        <td style={{ ...S.td, fontWeight: '600' }}>₱{Number(r.totalAmount || 0).toLocaleString()}</td>
                        <td style={S.td}>
                          <span style={{ ...badge(statusBadgeKind(r.status)), padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '600', textTransform: 'capitalize' }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={S.td}>
                          <button onClick={() => handleSelect(r)}
                            style={{ ...badge('red'), border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                            Cancel
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Cancellation Panel */}
          <div>
            {!selected ? (
              <div style={{ ...S.card, padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', marginBottom: '14px' }}>🚫</div>
                <div style={{ fontWeight: '600', color: TEXT, marginBottom: '6px' }}>No reservation selected</div>
                <div style={{ fontSize: '12px', color: MUTED }}>Click "Cancel" on a reservation to process cancellation</div>
              </div>
            ) : cancelResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Guest Info */}
                <div style={{ ...S.card, padding: '20px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT, marginBottom: '4px' }}>{selected.guestName}</div>
                  <div style={{ fontSize: '12px', color: SUBTEXT }}>Room {selected.roomNumber} · {selected.checkIn} → {selected.checkOut}</div>
                </div>

                {/* Fee Calculation */}
                <div style={{ ...S.card, padding: '20px' }}>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: TEXT, marginBottom: '14px' }}>Cancellation Fee Breakdown</div>

                  {/* Days indicator */}
                  <div style={{
                    ...badge(cancelResult.daysBeforeCheckIn > 7 ? 'green' : cancelResult.daysBeforeCheckIn >= 4 ? 'yellow' : 'red'),
                    borderRadius: '10px', padding: '12px', marginBottom: '14px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '24px', fontWeight: '700' }}>{cancelResult.daysBeforeCheckIn}</div>
                    <div style={{ fontSize: '11px', opacity: 0.85 }}>days before check-in</div>
                    <div style={{ fontSize: '11px', fontWeight: '600', marginTop: '4px' }}>{cancelResult.tier}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { label: 'Total Booking Amount', value: `₱${cancelResult.totalAmount.toLocaleString()}`, color: TEXT },
                      { label: `Cancellation Rate`, value: `${cancelResult.rate}%`, color: RED },
                      { label: 'Cancellation Fee', value: `₱${cancelResult.fee.toLocaleString()}`, color: RED, bold: true },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: SUBTEXT }}>{row.label}</span>
                        <span style={{ color: row.color, fontWeight: row.bold ? '700' : '500' }}>{row.value}</span>
                      </div>
                    ))}

                    <div style={{ borderTop: `2px solid ${BORDER}`, paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700' }}>
                      <span style={{ color: TEXT }}>Guest Refund</span>
                      <span style={{ color: GREEN }}>₱{cancelResult.refund.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Confirm buttons */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setSelected(null); setCancelResult(null); }}
                    style={{ flex: 1, background: CARD2, color: SUBTEXT, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Go Back
                  </button>
                  <button onClick={handleCancel}
                    style={{ flex: 1, background: dark ? '#b91c1c' : '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Confirm Cancel
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