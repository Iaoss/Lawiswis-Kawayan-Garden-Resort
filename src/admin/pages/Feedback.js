import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, writeBatch } from 'firebase/firestore';
import Layout from '../components/Layout';
import { useSettings } from '../components/SettingsContext';

/* ---------------------------------- icons --------------------------------- */
const Ico = ({ d, size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
);
const Star = ({ size = 13, filled }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />
  </svg>
);
const IconCheck = ({ size }) => <Ico size={size} d={<path d="M20 6L9 17l-5-5" />} />;
const IconCopy = () => <Ico size={13} d={<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>} />;
const IconInbox = ({ size = 22 }) => <Ico size={size} d={<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>} />;

export default function Feedback() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  const ACCENT      = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const ACCENT_TEXT_MUTED = 'rgba(10,26,10,0.65)';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f3f4f6';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = '#9ca3af';
  const TRACK   = dark ? '#282827' : '#f3f4f6';
  const AVATAR_BG = dark ? '#282827' : '#1f2937';

  const GREEN = dark ? '#86efac' : '#16a34a';
  const RED   = dark ? '#fca5a5' : '#dc2626';
  const STAR  = '#e8a33d';
  const NEGATIVE_BAR = dark ? '#f87171' : '#ef4444';

  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState(false);

  /* Real-time: new guest feedback appears here without a refresh. */
  useEffect(() => {
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setFeedbacks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const markRead = (id) => updateDoc(doc(db, 'feedback', id), { read: true });

  const markAllRead = async () => {
    const unread = feedbacks.filter(f => !f.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(f => batch.update(doc(db, 'feedback', f.id), { read: true }));
    await batch.commit();
  };

  const rate = (f) => Math.max(0, Math.min(5, Number(f.rating) || 0));

  const filtered = feedbacks.filter(f => {
    if (filter === 'negative') return rate(f) <= 2 && rate(f) > 0;
    if (filter === 'positive') return rate(f) >= 4;
    if (filter === 'neutral') return rate(f) === 3;
    if (filter === 'unread')   return !f.read;
    return true;
  });

  const unreadCount = feedbacks.filter(f => !f.read).length;
  const avgRating = feedbacks.length
    ? (feedbacks.reduce((s, f) => s + rate(f), 0) / feedbacks.length).toFixed(1)
    : 0;
  const ratingPct = (avgRating / 5) * 100;

  const last7 = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayFeedbacks = feedbacks.filter(f => {
      if (!f.createdAt?.seconds) return false;
      return new Date(f.createdAt.seconds * 1000).toDateString() === d.toDateString();
    });
    return {
      day: `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`,
      positive: dayFeedbacks.filter(f => rate(f) >= 4).length,
      negative: dayFeedbacks.filter(f => rate(f) <= 2 && rate(f) > 0).length,
    };
  });
  const maxBar = Math.max(1, ...last7.map(d => Math.max(d.positive, d.negative)));

  const feedbackUrl = `${window.location.origin}/feedback`;
  const copyLink = () => {
    navigator.clipboard?.writeText(feedbackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const S = {
    card: {
      background: CARD, borderRadius: '16px', border: `1px solid ${BORDER}`, padding: '20px',
      fontFamily: "'Poppins', sans-serif",
      boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
    },
  };

  const Stars = ({ n }) => (
    <span style={{ display: 'inline-flex', gap: '1px', color: STAR, verticalAlign: '-2px' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ color: s <= n ? STAR : (dark ? '#3a3a38' : '#d8dcd9'), lineHeight: 0 }}>
          <Star filled={s <= n} />
        </span>
      ))}
    </span>
  );

  return (
    <Layout>
      <style>{`
        @keyframes fb-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes fb-pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes fb-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        .fb-card{animation:fb-in .35s ease both}
        .fb-bar{transform-origin:bottom;animation:fb-grow .5s cubic-bezier(.2,.8,.3,1) both}
        .fb-dot{animation:fb-pulse 1.8s ease-in-out infinite}
        .fb-btn{transition:transform .15s ease,opacity .15s ease}
        .fb-btn:hover{transform:translateY(-1px)}
        @media (prefers-reduced-motion:reduce){.fb-card,.fb-bar,.fb-dot{animation:none!important}}
      `}</style>

      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>

        {/* header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: TEXT }}>Guest feedback</div>
            <div style={{ fontSize: '12px', color: MUTED }}>
              {loading ? 'Loading…' : unreadCount ? `${unreadCount} new since you last looked` : 'All caught up'}
            </div>
          </div>
          {unreadCount > 0 && (
            <button className="fb-btn" onClick={markAllRead}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', background: ACCENT, color: ACCENT_TEXT,
                border: 'none', borderRadius: '10px', padding: '9px 15px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              <IconCheck size={14} /> Mark all read
            </button>
          )}
        </div>

        {/* chart + rating */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div style={S.card} className="fb-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Last 7 days</div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: SUBTEXT }}>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: ACCENT, marginRight: '4px' }} />Positive</span>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: NEGATIVE_BAR, marginRight: '4px' }} />Negative</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '140px' }}>
              {last7.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '2px', width: '100%' }}>
                    <div className="fb-bar" style={{ width: '100%', borderRadius: '4px', background: ACCENT, animationDelay: `${i * 0.05}s`, height: `${(d.positive / maxBar) * 100}%`, minHeight: d.positive > 0 ? '4px' : '0' }} />
                    <div className="fb-bar" style={{ width: '100%', borderRadius: '4px', background: NEGATIVE_BAR, animationDelay: `${i * 0.05}s`, height: `${(d.negative / maxBar) * 100}%`, minHeight: d.negative > 0 ? '4px' : '0' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: MUTED }}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card} className="fb-card">
            <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT, marginBottom: '14px' }}>Overall rating</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <svg width="120" height="70" viewBox="0 0 120 70">
                <path d="M10 65 A 50 50 0 0 1 110 65" fill="none" stroke={TRACK} strokeWidth="10" strokeLinecap="round" />
                <path d="M10 65 A 50 50 0 0 1 110 65" fill="none" stroke={ACCENT} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${ratingPct * 1.57} 999`} style={{ transition: 'stroke-dasharray .6s ease' }} />
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

        {/* stats + QR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 280px', gap: '16px', marginBottom: '16px' }}>
          <div style={S.card} className="fb-card">
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>Total feedback</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: TEXT }}>{feedbacks.length}</div>
          </div>
          <div style={S.card} className="fb-card">
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>Positive</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: GREEN }}>{feedbacks.filter(f => rate(f) >= 4).length}</div>
          </div>
          <div style={S.card} className="fb-card">
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>Needs follow-up</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: RED }}>{feedbacks.filter(f => rate(f) <= 2 && rate(f) > 0).length}</div>
          </div>
          <div style={{ ...S.card, textAlign: 'center', padding: '14px' }} className="fb-card">
            <div style={{ fontWeight: '600', fontSize: '12px', color: TEXT, marginBottom: '8px' }}>Guest form QR</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(feedbackUrl)}`}
              alt="QR code linking to the guest feedback form"
              style={{ borderRadius: '8px', background: '#fff', padding: '4px' }} />
            <button className="fb-btn" onClick={copyLink}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%',
                marginTop: '10px', background: CARD2, color: SUBTEXT, border: 'none', borderRadius: '8px',
                padding: '7px', fontSize: '11px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              {copied ? <><IconCheck size={13} /> Link copied</> : <><IconCopy /> Copy link</>}
            </button>
          </div>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {[
            { value: 'all', label: 'All' },
            { value: 'positive', label: 'Positive' },
            { value: 'neutral', label: 'Neutral' },
            { value: 'negative', label: 'Negative' },
            { value: 'unread', label: 'Unread' },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => setFilter(value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '500',
                border: filter === value ? 'none' : `1px solid ${BORDER}`,
                background: filter === value ? ACCENT : CARD,
                color: filter === value ? ACCENT_TEXT : SUBTEXT,
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
              }}>
              {label}
              {value === 'unread' && unreadCount > 0 && (
                <span className="fb-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: filter === value ? ACCENT_TEXT : NEGATIVE_BAR }} />
              )}
            </button>
          ))}
        </div>

        {/* reviews */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
          {filtered.length === 0 ? (
            <div style={{ ...S.card, gridColumn: 'span 2', textAlign: 'center', color: MUTED, padding: '46px' }}>
              <div style={{ color: BORDER === '#e5e7eb' ? '#cbd2cd' : '#3a3a38', marginBottom: '10px' }}><IconInbox /></div>
              <div style={{ fontSize: '13px', color: SUBTEXT, marginBottom: '4px' }}>
                {loading ? 'Loading feedback…' : 'Nothing here yet'}
              </div>
              {!loading && <div style={{ fontSize: '11.5px' }}>Print the QR code above and put it at reception or in each room.</div>}
            </div>
          ) : (
            filtered.map((f, i) => (
              <div key={f.id} className="fb-card"
                style={{ ...S.card, animationDelay: `${Math.min(i, 8) * 0.04}s`,
                  borderLeft: !f.read ? `3px solid ${ACCENT}` : S.card.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: AVATAR_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
                      {(f.guestName || 'A')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: TEXT }}>{f.guestName || 'Anonymous guest'}</div>
                      <div style={{ fontSize: '11px', color: MUTED, display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <Stars n={rate(f)} />
                        {f.createdAt?.seconds
                          ? new Date(f.createdAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'Just now'}
                      </div>
                    </div>
                  </div>
                  {!f.read && (
                    <button className="fb-btn" onClick={() => markRead(f.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', background: CARD2, color: SUBTEXT, border: 'none', borderRadius: '7px', padding: '5px 9px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", flexShrink: 0 }}>
                      <IconCheck size={12} /> Mark read
                    </button>
                  )}
                </div>

                {f.comment
                  ? <p style={{ fontSize: '12.5px', color: SUBTEXT, lineHeight: '1.65', margin: 0 }}>{f.comment}</p>
                  : <p style={{ fontSize: '12.5px', color: MUTED, fontStyle: 'italic', margin: 0 }}>No comment left.</p>}

                {f.ratings && typeof f.ratings === 'object' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px', marginTop: '10px' }}>
                    {[['ambience', 'Garden'], ['rooms', 'Rooms'], ['staff', 'Staff'], ['facilities', 'Facilities']]
                      .filter(([k]) => Number(f.ratings[k]) > 0)
                      .map(([k, label]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: MUTED }}>
                          <span>{label}</span>
                          <Stars n={Math.min(5, Number(f.ratings[k]) || 0)} />
                        </div>
                      ))}
                  </div>
                )}

                {Array.isArray(f.tags) && f.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {f.tags.map(t => (
                      <span key={t} style={{ fontSize: '10.5px', padding: '3px 9px', borderRadius: '20px', background: CARD2, color: SUBTEXT }}>{t}</span>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: '10.5px', color: MUTED, marginTop: '10px' }}>
                  Room {f.roomNumber || 'not given'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}