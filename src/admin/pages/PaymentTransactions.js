import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

export default function PaymentTransactions() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const ACCENT      = settings?.accentColor || '#c8f06e';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f9fafb';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const GREEN   = dark ? '#86efac' : '#16a34a';
  const BLUE    = dark ? '#93c5fd' : '#2563eb';
  const HOVER_BG= dark ? '#242422' : '#f9fafb';

  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDocs(collection(db, 'payments'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPayments(data);
    };
    fetch();
  }, []);

  const filtered = payments.filter(p =>
    p.guestName?.toLowerCase().includes(search.toLowerCase()) ||
    p.roomNumber?.includes(search)
  );

  const total = filtered.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  /* ── shared styles ── */
  const card = { background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)' };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: TEXT, marginBottom: '22px' }}>Payment Transactions</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '22px' }}>
          <div style={{ ...card, padding: '16px' }}>
            <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>Total Collected</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: GREEN, margin: '4px 0 0' }}>₱{total.toLocaleString()}</p>
          </div>
          <div style={{ ...card, padding: '16px' }}>
            <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>Total Transactions</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: BLUE, margin: '4px 0 0' }}>{filtered.length}</p>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by guest name or room..."
            style={{
              border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 14px',
              fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '288px',
              background: CARD2, color: TEXT, outline: 'none', boxSizing: 'border-box',
            }} />
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead style={{ background: CARD2 }}>
              <tr>
                {['Guest', 'Room', 'Amount', 'Method', 'Date'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: '600', fontSize: '12px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px 0', color: MUTED }}>No transactions yet.</td></tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: TEXT }}>{p.guestName}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>Room {p.roomNumber}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: GREEN }}>₱{Number(p.amount).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', color: TEXT, textTransform: 'capitalize' }}>{p.method}</td>
                    <td style={{ padding: '12px 16px', color: MUTED }}>
                      {p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}