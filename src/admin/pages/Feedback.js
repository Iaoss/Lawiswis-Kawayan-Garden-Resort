import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, writeBatch } from 'firebase/firestore';
import Layout from '../components/Layout';
import DashboardSkeleton from '../components/DashboardSkeleton';
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
const IconChat = () => <Ico size={18} d={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />} />;
const IconThumb = () => <Ico size={18} d={<><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" /><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></>} />;
const IconAlert = () => <Ico size={18} d={<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>} />;
const IconStar = () => <Ico size={18} d={<path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />} />;

const CATEGORIES = [['ambience', 'Garden'], ['rooms', 'Rooms'], ['staff', 'Staff'], ['facilities', 'Facilities']];

export default function Feedback() {
  const { settings, formatDate } = useSettings();
  const dark = settings?.darkMode;

  const ACCENT      = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f3f4f6';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = '#9ca3af';
  const TRACK   = dark ? '#282827' : '#eef2ea';
  const HOVER_BG = dark ? '#242422' : '#f9fafb';
  const AVATAR_BG = dark ? '#282827' : '#e8efdc';

  const GREEN = dark ? '#86efac' : '#16a34a';
  const RED   = dark ? '#fca5a5' : '#dc2626';
  const STAR  = '#e8a33d';
  const NEGATIVE_BAR = dark ? '#f87171' : '#ef4444';
  const MINT = '#86d6b4';

  // Dashboard-style gradient tiles
  const GRADIENTS = {
    total:    'linear-gradient(135deg, #a5a6f6 0%, #d9d6fb 100%)',
    positive: 'linear-gradient(135deg, #7be0c8 0%, #b5f0e0 100%)',
    neutral:  'linear-gradient(135deg, #d6a86c 0%, #f0cfa0 100%)',
    negative: 'linear-gradient(135deg, #fb923c 0%, #fdba9b 100%)',
  };
  const DIST_COLORS = { 5: ACCENT, 4: MINT, 3: '#60a5fa', 2: '#fb923c', 1: '#f87171' };

  const [feedbacks, setFeedbacks] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [subscriberError, setSubscriberError] = useState('');
  const [subscriberSaving, setSubscriberSaving] = useState('');
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

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'newsletterSubscribers'), snapshot => {
      const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      items.sort((a, b) => {
        const aDate = a.joinedAt?.toMillis?.() || 0;
        const bDate = b.joinedAt?.toMillis?.() || 0;
        return bDate - aDate;
      });
      setSubscribers(items);
      setSubscriberError('');
    }, error => {
      console.error('Could not load newsletter subscribers:', error);
      setSubscriberError('Subscriber list could not be loaded. Check newsletterSubscribers Firestore permissions.');
    });
    return unsubscribe;
  }, []);

  const updateSubscriberStatus = async subscriber => {
    const status = subscriber.status === 'active' ? 'unsubscribed' : 'active';
    setSubscriberSaving(subscriber.id);
    setSubscriberError('');
    try {
      await updateDoc(doc(db, 'newsletterSubscribers', subscriber.id), { status });
    } catch (error) {
      console.error('Could not update newsletter subscription:', error);
      setSubscriberError('Subscription status could not be updated.');
    } finally {
      setSubscriberSaving('');
    }
  };

  const markRead = (id) => updateDoc(doc(db, 'feedback', id), { read: true });

  const markAllRead = async () => {
    const unread = feedbacks.filter(f => !f.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(f => batch.update(doc(db, 'feedback', f.id), { read: true }));
    await batch.commit();
  };

  const rate = (f) => Math.max(0, Math.min(5, Number(f.rating) || 0));
  const timeOf = f => f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000) : null;
  const timeLabel = f => {
    const d = timeOf(f);
    return d ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
  };

  const filtered = feedbacks.filter(f => {
    if (filter === 'negative') return rate(f) <= 2 && rate(f) > 0;
    if (filter === 'positive') return rate(f) >= 4;
    if (filter === 'neutral') return rate(f) === 3;
    if (filter === 'unread')   return !f.read;
    return true;
  });

  const unreadList = feedbacks.filter(f => !f.read);
  const unreadCount = unreadList.length;
  const positiveCount = feedbacks.filter(f => rate(f) >= 4).length;
  const neutralCount = feedbacks.filter(f => rate(f) === 3).length;
  const negativeCount = feedbacks.filter(f => rate(f) <= 2 && rate(f) > 0).length;
  const avgRating = feedbacks.length
    ? (feedbacks.reduce((s, f) => s + rate(f), 0) / feedbacks.length).toFixed(1)
    : '0.0';
  const ratingLabel = avgRating >= 4 ? 'Impressive' : avgRating >= 3 ? 'Good' : 'Needs attention';

  const distribution = [5, 4, 3, 2, 1].map(n => ({
    n, count: feedbacks.filter(f => Math.round(rate(f)) === n).length,
  }));
  const maxDist = Math.max(1, ...distribution.map(d => d.count));

  const categoryAvgs = CATEGORIES.map(([key, label]) => {
    const vals = feedbacks.map(f => Number(f.ratings?.[key]) || 0).filter(v => v > 0);
    return { key, label, count: vals.length, avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
  });

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
      boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.04)',
    },
    title: { fontWeight: 700, fontSize: '15px', color: TEXT, margin: 0 },
  };

  const Stars = ({ n, size }) => (
    <span style={{ display: 'inline-flex', gap: '1px', verticalAlign: '-2px' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ color: s <= Math.round(n) ? STAR : (dark ? '#3a3a38' : '#d8dcd9'), lineHeight: 0 }}>
          <Star size={size} filled={s <= Math.round(n)} />
        </span>
      ))}
    </span>
  );

  const Avatar = ({ name, size = 34 }) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: AVATAR_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: dark ? ACCENT : '#5f7a35', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {(name || 'A')[0].toUpperCase()}
    </div>
  );

  if (loading) return <Layout><DashboardSkeleton /></Layout>;

  const tiles = [
    { label: 'Total Feedback', value: feedbacks.length, bg: GRADIENTS.total,    icon: <IconChat /> },
    { label: 'Positive',       value: positiveCount,    bg: GRADIENTS.positive, icon: <IconThumb /> },
    { label: 'Neutral',        value: neutralCount,     bg: GRADIENTS.neutral,  icon: <IconStar /> },
    { label: 'Needs Follow-up',value: negativeCount,    bg: GRADIENTS.negative, icon: <IconAlert /> },
  ];

  const th = { padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
  const td = { padding: '14px 16px', verticalAlign: 'top', fontSize: '12.5px' };

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
        .fb-row:hover{background:${HOVER_BG}}
        .fb-scroll::-webkit-scrollbar{width:6px;height:6px}
        .fb-scroll::-webkit-scrollbar-thumb{background:${BORDER};border-radius:6px}
        @media (max-width:1100px){.fb-grid-3,.fb-grid-2{grid-template-columns:1fr!important}}
        @media (prefers-reduced-motion:reduce){.fb-card,.fb-bar,.fb-dot{animation:none!important}}
      `}</style>

      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '24px' }}>

        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '22px', fontWeight: 700, color: TEXT }}>
              Feedback
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '16px', fontWeight: 600, color: TEXT }}>
                <span style={{ color: STAR, lineHeight: 0 }}><Star size={18} filled /></span>{avgRating}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: MUTED }}>
              ({feedbacks.length} ratings overall) · {unreadCount ? `${unreadCount} new since you last looked` : 'All caught up'}
            </div>
          </div>
          {unreadCount > 0 && (
            <button className="fb-btn" onClick={markAllRead}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', background: ACCENT, color: '#fff',
                border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              <IconCheck size={14} /> Mark all read
            </button>
          )}
        </div>

        {/* gradient tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {tiles.map(t => (
            <div key={t.label} className="fb-card" style={{ background: t.bg, borderRadius: '16px', padding: '18px', color: '#fff', position: 'relative', overflow: 'hidden', minHeight: '100px' }}>
              <span style={{ position: 'absolute', top: '14px', right: '14px', width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</span>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>{t.label}</div>
              <div style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', lineHeight: 1.1 }}>{t.value}</div>
            </div>
          ))}
        </div>

        {/* overall / category / comments */}
        <div className="fb-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '16px', marginBottom: '20px' }}>
          {/* overall rating + distribution */}
          <div style={S.card} className="fb-card">
            <div style={{ ...S.title, textAlign: 'center', marginBottom: '14px' }}>Overall Rating</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <div style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'linear-gradient(135deg, #7be0c8 0%, #9cb56f 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, boxShadow: '0 0 0 8px rgba(156,181,111,0.18)' }}>
                {avgRating}
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <Stars n={Number(avgRating)} size={16} />
              <div style={{ fontSize: '12px', fontWeight: 600, color: TEXT, marginTop: '6px' }}>{ratingLabel}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>{feedbacks.length} ratings</div>
            </div>
            <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
              {distribution.map(d => (
                <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: MUTED }}>
                  <span style={{ width: '10px' }}>{d.n}</span>
                  <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: TRACK }}>
                    <div style={{ width: `${(d.count / maxDist) * 100}%`, height: '6px', borderRadius: '999px', background: DIST_COLORS[d.n], transition: 'width .5s ease' }} />
                  </div>
                  <span style={{ width: '22px', textAlign: 'right' }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* category ratings */}
          <div style={S.card} className="fb-card">
            <div style={{ ...S.title, textAlign: 'center', marginBottom: '14px' }}>Category Ratings</div>
            <div style={{ display: 'grid', gap: '16px', marginTop: '6px' }}>
              {categoryAvgs.map(c => (
                <div key={c.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', marginBottom: '6px' }}>
                    <span style={{ color: SUBTEXT }}>{c.label}</span>
                    <span style={{ fontWeight: 700, color: TEXT }}>{c.count ? c.avg.toFixed(1) : '—'}</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '999px', background: TRACK }}>
                    <div style={{ width: `${(c.avg / 5) * 100}%`, height: '6px', borderRadius: '999px', background: ACCENT, transition: 'width .5s ease' }} />
                  </div>
                  <div style={{ fontSize: '10.5px', color: MUTED, marginTop: '4px' }}>{c.count} ratings</div>
                </div>
              ))}
            </div>
          </div>

          {/* recent comments */}
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }} className="fb-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={S.title}>Comments</div>
                <div style={{ fontSize: '11px', color: MUTED }}>{unreadCount} unread</div>
              </div>
              <button className="fb-btn" onClick={() => setFilter('all')}
                style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: '8px', padding: '4px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                See all
              </button>
            </div>
            <div className="fb-scroll" style={{ display: 'grid', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
              {feedbacks.filter(f => f.comment).slice(0, 6).map(f => (
                <div key={f.id} style={{ display: 'flex', gap: '10px', padding: '10px 0', borderTop: `1px solid ${BORDER}` }}>
                  <Avatar name={f.guestName} size={32} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: TEXT, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {f.guestName || 'Anonymous guest'}
                        {!f.read && <span className="fb-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: ACCENT }} />}
                      </span>
                      <span style={{ fontSize: '10.5px', color: MUTED, whiteSpace: 'nowrap' }}>{timeLabel(f)}</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: SUBTEXT, lineHeight: 1.5, marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.comment}</div>
                  </div>
                </div>
              ))}
              {!feedbacks.some(f => f.comment) && (
                <div style={{ color: MUTED, fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>No comments yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* chart + QR */}
        <div className="fb-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', marginBottom: '20px' }}>
          <div style={S.card} className="fb-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={S.title}>Last 7 days</div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: SUBTEXT }}>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: MINT, marginRight: '4px' }} />Positive</span>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: ACCENT, marginRight: '4px' }} />Negative</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '150px' }}>
              {last7.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '4px', width: '100%' }}>
                    <div className="fb-bar" title={`${d.positive} positive`} style={{ width: '40%', maxWidth: '18px', borderRadius: '4px 4px 0 0', background: MINT, animationDelay: `${i * 0.05}s`, height: `${(d.positive / maxBar) * 100}%`, minHeight: d.positive > 0 ? '4px' : '0' }} />
                    <div className="fb-bar" title={`${d.negative} negative`} style={{ width: '40%', maxWidth: '18px', borderRadius: '4px 4px 0 0', background: ACCENT, animationDelay: `${i * 0.05}s`, height: `${(d.negative / maxBar) * 100}%`, minHeight: d.negative > 0 ? '4px' : '0' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: MUTED }}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...S.card, textAlign: 'center' }} className="fb-card">
            <div style={{ ...S.title, fontSize: '14px', marginBottom: '10px' }}>Guest form QR</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(feedbackUrl)}`}
              alt="QR code linking to the guest feedback form"
              style={{ borderRadius: '10px', background: '#fff', padding: '5px', border: `1px solid ${BORDER}` }} />
            <button className="fb-btn" onClick={copyLink}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%',
                marginTop: '12px', background: CARD2, color: SUBTEXT, border: 'none', borderRadius: '8px',
                padding: '8px', fontSize: '11px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              {copied ? <><IconCheck size={13} /> Link copied</> : <><IconCopy /> Copy link</>}
            </button>
          </div>
        </div>

        {/* newsletter subscriber list */}
        <section style={{ ...S.card, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={S.title}>Newsletter subscribers</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
                {subscribers.filter(subscriber => subscriber.status === 'active').length} active · {subscribers.length} total
              </div>
            </div>
          </div>
          {subscriberError && <div role="alert" style={{ color: RED, fontSize: 12, marginBottom: 12 }}>{subscriberError}</div>}
          {subscribers.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 12, padding: '14px 0' }}>No subscriptions have been recorded yet.</div>
          ) : (
            <div className="fb-scroll" style={{ display: 'grid', gap: 0, maxHeight: '320px', overflowY: 'auto' }}>
              {subscribers.map(subscriber => {
                const active = subscriber.status === 'active';
                const joinedAt = subscriber.joinedAt?.toDate?.();
                return (
                  <div key={subscriber.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: `1px solid ${BORDER}`, padding: '10px 0' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: TEXT, fontSize: 12, overflowWrap: 'anywhere' }}>{subscriber.email}</div>
                      <div style={{ color: MUTED, fontSize: 10, marginTop: 3 }}>
                        Joined {joinedAt ? formatDate(joinedAt) : 'date unavailable'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: active ? GREEN : MUTED, background: CARD2, borderRadius: 999, padding: '4px 9px', fontSize: 10, fontWeight: 600 }}>
                        {active ? 'Active' : 'Unsubscribed'}
                      </span>
                      <button type="button" disabled={subscriberSaving === subscriber.id} onClick={() => updateSubscriberStatus(subscriber)}
                        style={{ color: SUBTEXT, background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 9px', fontSize: 10, cursor: subscriberSaving === subscriber.id ? 'wait' : 'pointer' }}>
                        {subscriberSaving === subscriber.id ? 'Saving…' : active ? 'Unsubscribe' : 'Reactivate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* guests table */}
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: TEXT }}>Guests ({feedbacks.length})</div>
              <div style={{ fontSize: '11.5px', color: MUTED }}>Showing {filtered.length} of {feedbacks.length}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                    padding: '7px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 500,
                    border: filter === value ? 'none' : `1px solid ${BORDER}`,
                    background: filter === value ? ACCENT : CARD,
                    color: filter === value ? '#fff' : SUBTEXT,
                    cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                  }}>
                  {label}
                  {value === 'unread' && unreadCount > 0 && (
                    <span className="fb-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: filter === value ? '#fff' : NEGATIVE_BAR }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: MUTED, padding: '46px' }}>
              <div style={{ color: dark ? '#3a3a38' : '#cbd2cd', marginBottom: '10px' }}><IconInbox /></div>
              <div style={{ fontSize: '13px', color: SUBTEXT, marginBottom: '4px' }}>Nothing here yet</div>
              <div style={{ fontSize: '11.5px' }}>Print the QR code above and put it at reception or in each room.</div>
            </div>
          ) : (
            <div className="fb-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                <thead style={{ background: CARD2 }}>
                  <tr>
                    <th style={th}>Guest</th>
                    <th style={th}>Rating</th>
                    {CATEGORIES.map(([, label]) => <th key={label} style={th}>{label}</th>)}
                    <th style={th}>Room</th>
                    <th style={th}>Comment</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(f => (
                    <tr key={f.id} className="fb-row" style={{ borderTop: `1px solid ${BORDER}`, boxShadow: !f.read ? `inset 3px 0 0 ${ACCENT}` : 'none' }}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar name={f.guestName} />
                          <div>
                            <div style={{ fontWeight: 600, color: TEXT }}>{f.guestName || 'Anonymous guest'}</div>
                            <div style={{ fontSize: '10.5px', color: MUTED }}>{timeLabel(f)}</div>
                          </div>
                        </div>
                      </td>
                      <td style={td}><Stars n={rate(f)} size={13} /></td>
                      {CATEGORIES.map(([k]) => (
                        <td key={k} style={td}>
                          {Number(f.ratings?.[k]) > 0 ? <Stars n={Math.min(5, Number(f.ratings[k]))} size={11} /> : <span style={{ color: MUTED }}>—</span>}
                        </td>
                      ))}
                      <td style={{ ...td, color: SUBTEXT, whiteSpace: 'nowrap' }}>{f.roomNumber ? `Room ${f.roomNumber}` : '—'}</td>
                      <td style={{ ...td, maxWidth: '280px' }}>
                        {f.comment
                          ? <div style={{ color: SUBTEXT, lineHeight: 1.6 }}>{f.comment}</div>
                          : <div style={{ color: MUTED, fontStyle: 'italic' }}>No comment left.</div>}
                        {Array.isArray(f.tags) && f.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                            {f.tags.map(t => (
                              <span key={t} style={{ fontSize: '10.5px', padding: '2px 9px', borderRadius: '20px', background: CARD2, color: SUBTEXT }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {!f.read && (
                          <button className="fb-btn" onClick={() => markRead(f.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', background: CARD2, color: SUBTEXT, border: 'none', borderRadius: '7px', padding: '5px 9px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap' }}>
                            <IconCheck size={12} /> Mark read
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}