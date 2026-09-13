import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import Layout from '../components/Layout';
import { useSettings } from '../components/SettingsContext';

export default function Feedback() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  const ACCENT      = settings?.accentColor || '#c8f06e';
  const ACCENT_TEXT = '#0a1a0a';
  const ACCENT_TEXT_MUTED = 'rgba(10,26,10,0.65)';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f3f4f6';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const TRACK   = dark ? '#282827' : '#f3f4f6';
  const AVATAR_BG = dark ? '#282827' : '#1f2937';

  const SUCCESS_BG   = dark ? '#14532d' : '#dcfce7';
  const SUCCESS_TEXT = dark ? '#86efac' : '#15803d';
  const ERROR_BG      = dark ? '#7f1d1d' : '#fee2e2';
  const ERROR_TEXT    = dark ? '#fca5a5' : '#b91c1c';
  const GREEN = dark ? '#86efac' : '#16a34a';
  const RED   = dark ? '#fca5a5' : '#dc2626';
  const NEGATIVE_BAR = dark ? '#f87171' : '#ef4444';

  const badge = (kind) => {
    const map = {
      purple: { dbg: '#2d1b4e', dtext: '#c4b5fd', lbg: '#ede9fe', ltext: '#7c3aed' },
      blue:   { dbg: '#1e3a5f', dtext: '#93c5fd', lbg: '#dbeafe', ltext: '#1d4ed8' },
      green:  { dbg: '#14532d', dtext: '#86efac', lbg: '#dcfce7', ltext: '#15803d' },
      red:    { dbg: '#7f1d1d', dtext: '#fca5a5', lbg: '#fee2e2', ltext: '#b91c1c' },
    };
    const c = map[kind] || map.blue;
    return dark ? { background: c.dbg, color: c.dtext } : { background: c.lbg, color: c.ltext };
  };
  const badgeStyle = { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' };

  const [feedbacks, setFeedbacks] = useState([]);
  const [filter, setFilter] = useState('all');

  const fetchFeedbacks = async () => {
    const snap = await getDocs(collection(db, 'feedback'));
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setFeedbacks(data);
  };

  useEffect(() => { fetchFeedbacks(); }, []);

  const markRead = async (id) => {
    await updateDoc(doc(db, 'feedback', id), { read: true });
    fetchFeedbacks();
  };

  const filtered = feedbacks.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'negative') return f.rating <= 2;
    if (filter === 'positive') return f.rating >= 4;
    if (filter === 'unread') return !f.read;
    return true;
  });

  const avgRating = feedbacks.length > 0
    ? (feedbacks.reduce((s, f) => s + Number(f.rating || 0), 0) / feedbacks.length).toFixed(1)
    : 0;

  const ratingPct = (avgRating / 5) * 100;

  // Last 7 days bar chart data
  const last7 = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
    const dayFeedbacks = feedbacks.filter(f => {
      if (!f.createdAt?.seconds) return false;
      const fd = new Date(f.createdAt.seconds * 1000);
      return fd.toDateString() === d.toDateString();
    });
    return {
      day: dayStr,
      positive: dayFeedbacks.filter(f => f.rating >= 4).length,
      negative: dayFeedbacks.filter(f => f.rating <= 2).length,
    };
  });
  const maxBar = Math.max(1, ...last7.map(d => Math.max(d.positive, d.negative)));

  const feedbackUrl = `${window.location.origin}/feedback`;

  const S = {
    card: { background: CARD, borderRadius: '16px', border: `1px solid ${BORDER}`, padding: '20px', fontFamily: "'Poppins', sans-serif", boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : 'none' },
  };

  return (
    <Layout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        {/* Top row: chart + rating */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Bar chart */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Feedback statistics</div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: SUBTEXT }}>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: ACCENT, marginRight: '4px' }} />Positive</span>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: NEGATIVE_BAR, marginRight: '4px' }} />Negative</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '140px' }}>
              {last7.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '2px', width: '100%' }}>
                    <div style={{ width: '100%', borderRadius: '4px', background: ACCENT, height: `${(d.positive / maxBar) * 100}%`, minHeight: d.positive > 0 ? '4px' : '0' }} />
                    <div style={{ width: '100%', borderRadius: '4px', background: NEGATIVE_BAR, height: `${(d.negative / maxBar) * 100}%`, minHeight: d.negative > 0 ? '4px' : '0' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: MUTED }}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Overall rating gauge */}
          <div style={S.card}>
            <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT, marginBottom: '14px' }}>Overall rating</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <svg width="120" height="70" viewBox="0 0 120 70">
                <path d="M10 65 A 50 50 0 0 1 110 65" fill="none" stroke={TRACK} strokeWidth="10" strokeLinecap="round" />
                <path d="M10 65 A 50 50 0 0 1 110 65" fill="none" stroke={ACCENT} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${ratingPct * 1.57} 999`} />
              </svg>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '28px', fontWeight: '700', color: TEXT }}>{avgRating}</span>
              <span style={{ fontSize: '13px', color: MUTED }}>/5</span>
            </div>
            <div style={{ background: ACCENT, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontWeight: '600', fontSize: '13px', color: ACCENT_TEXT }}>
                {avgRating >= 4 ? 'Impressive' : avgRating >= 3 ? 'Good' : 'Needs attention'}
              </div>
              <div style={{ fontSize: '10px', color: ACCENT_TEXT_MUTED }}>from {feedbacks.length} reviews</div>
            </div>
          </div>
        </div>

        {/* QR + Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 280px', gap: '16px', marginBottom: '16px' }}>
          <div style={S.card}>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>Total feedback</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: TEXT }}>{feedbacks.length}</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>Positive</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: GREEN }}>{feedbacks.filter(f => f.rating >= 4).length}</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>Negative alerts</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: RED }}>{feedbacks.filter(f => f.rating <= 2).length}</div>
          </div>
          <div style={{ ...S.card, textAlign: 'center', padding: '14px' }}>
            <div style={{ fontWeight: '600', fontSize: '12px', color: TEXT, marginBottom: '8px' }}>Feedback QR code</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(feedbackUrl)}`}
              alt="QR Code" style={{ borderRadius: '8px', background: '#fff', padding: '4px' }} />
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {['all', 'positive', 'negative', 'unread'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '500',
                border: filter === f ? 'none' : `1px solid ${BORDER}`,
                background: filter === f ? ACCENT : CARD,
                color: filter === f ? ACCENT_TEXT : SUBTEXT,
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif", textTransform: 'capitalize',
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* Review cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
          {filtered.length === 0 ? (
            <div style={{ ...S.card, gridColumn: 'span 2', textAlign: 'center', color: MUTED, padding: '40px' }}>
              No feedback yet.
            </div>
          ) : (
            filtered.map(f => (
              <div key={f.id} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: AVATAR_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
                      {(f.guestName || 'A')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: TEXT }}>{f.guestName || 'Anonymous'}</div>
                      <div style={{ fontSize: '11px', color: '#fbbf24' }}>
                        {'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}
                        <span style={{ color: MUTED, marginLeft: '6px' }}>
                          {f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleDateString() : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!f.read && (
                    <button onClick={() => markRead(f.id)}
                      style={{ fontSize: '10px', background: CARD2, color: SUBTEXT, border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                      Mark read
                    </button>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: SUBTEXT, lineHeight: '1.6', margin: 0 }}>
                  "{f.comment || 'No comment provided.'}"
                </p>
                <div style={{ fontSize: '10px', color: MUTED, marginTop: '8px' }}>Room {f.roomNumber || '—'}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}