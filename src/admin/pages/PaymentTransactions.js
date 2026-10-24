import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { SortControls, sortRecords } from '../lib/listSort';
import { Pagination, usePagination } from '../../components/ui/pagination';

const paymentDateValue = payment => payment.paidAt || payment.paymentDate || payment.createdAt || payment.date;
const paymentDateMillis = payment => {
  const value = paymentDateValue(payment);
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
};

const RANGES = [
  { id: '7',   label: 'Last 7 days',  days: 7 },
  { id: '30',  label: 'Last 30 days', days: 30 },
  { id: '90',  label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time',     days: null },
];

const peso = (n, digits = 0) => `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

const dayKey = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const isCash = p => String(p.method || '').toLowerCase().includes('cash');

const statusOf = p => {
  const s = String(p.status || p.paymentStatus || 'completed').toLowerCase();
  if (['pending', 'processing', 'partial'].includes(s)) return 'pending';
  if (['failed', 'refunded', 'cancelled', 'canceled', 'voided'].includes(s)) return 'failed';
  return 'completed';
};

const AVATAR_COLORS = ['#a5b4fc', '#fdba74', '#86efac', '#f9a8d4', '#7dd3fc', '#fcd34d'];
const avatarColor = name => {
  let h = 0;
  for (const ch of String(name || '?')) h = (h * 31 + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
};
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

export default function PaymentTransactions() {
  const { settings, formatDate } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f4f6f4';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#111827';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = dark ? '#9ca3af' : '#6b7280';
  const GREEN   = dark ? '#86efac' : '#16a34a';
  const HOVER_BG = dark ? '#242422' : '#f9fafb';
  const BAR_A   = dark ? '#7c8cf0' : '#a5b4fc';   // digital
  const BAR_B   = dark ? '#e5e7eb' : '#1f2937';   // cash
  const GHOST   = dark ? '#3a3a38' : '#d1d5db';

  const PILL = {
    completed: dark ? { bg: '#14532d', color: '#86efac' } : { bg: '#dcfce7', color: '#15803d' },
    pending:   dark ? { bg: '#78350f', color: '#fde68a' } : { bg: '#fef3c7', color: '#b45309' },
    failed:    dark ? { bg: '#7f1d1d', color: '#fca5a5' } : { bg: '#fee2e2', color: '#b91c1c' },
  };
  const PILL_LABEL = { completed: 'Completed', pending: 'Pending', failed: 'Failed' };

  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('booked');
  const [sortDir, setSortDir] = useState('desc');
  const [rangeId, setRangeId] = useState('30');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'payments'));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => paymentDateMillis(b) - paymentDateMillis(a));
        setPayments(data);
      } catch (err) {
        console.error('Unable to load payments:', err);
        setError('Payments could not be loaded.');
      }
    };
    load();
  }, []);

  const range = RANGES.find(r => r.id === rangeId) || RANGES[1];

  // Payments inside the selected date range
  const inRange = useMemo(() => {
    if (!range.days) return payments;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const cutoff = start.getTime() - (range.days - 1) * 86400000;
    return payments.filter(p => paymentDateMillis(p) >= cutoff);
  }, [payments, range]);

  const total = inRange.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Today vs yesterday
  const { todayTotal, todayCount, yesterdayTotal } = useMemo(() => {
    const t = new Date();
    const todayK = dayKey(t.getTime());
    const yK = dayKey(t.getTime() - 86400000);
    let tt = 0, tc = 0, yt = 0;
    payments.forEach(p => {
      const ms = paymentDateMillis(p);
      if (!ms) return;
      const k = dayKey(ms);
      if (k === todayK) { tt += Number(p.amount || 0); tc += 1; }
      else if (k === yK) yt += Number(p.amount || 0);
    });
    return { todayTotal: tt, todayCount: tc, yesterdayTotal: yt };
  }, [payments]);

  const changePct = yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : null;

  // Daily bars (stacked: digital + cash)
  const bars = useMemo(() => {
    const n = range.days || 30;
    const map = {};
    (range.days ? inRange : payments).forEach(p => {
      const ms = paymentDateMillis(p);
      if (!ms) return;
      const k = dayKey(ms);
      map[k] = map[k] || { digital: 0, cash: 0 };
      map[k][isCash(p) ? 'cash' : 'digital'] += Number(p.amount || 0);
    });
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const v = map[dayKey(d.getTime())] || { digital: 0, cash: 0 };
      out.push({ key: dayKey(d.getTime()), ...v, sum: v.digital + v.cash });
    }
    const max = Math.max(1, ...out.map(b => b.sum));
    return { list: out, max };
  }, [payments, inRange, range]);

  // Method share
  const methodShare = useMemo(() => {
    const by = {};
    inRange.forEach(p => {
      const m = String(p.method || 'unknown').toLowerCase();
      by[m] = (by[m] || 0) + Number(p.amount || 0);
    });
    const entries = Object.entries(by).sort((a, b) => b[1] - a[1]);
    if (!entries.length || total <= 0) return { name: '—', pct: 0 };
    return { name: entries[0][0], pct: Math.round((entries[0][1] / total) * 100) };
  }, [inRange, total]);

  const recent = inRange.slice(0, 3);

  // Table rows
  const filtered = sortRecords(inRange.filter(p =>
    p.guestName?.toLowerCase().includes(search.toLowerCase()) ||
    p.roomNumber?.includes(search)
  ), sortBy, sortDir);
  const pagination = usePagination(filtered, { pageSize: 10, resetKey: `${search}|${sortBy}|${sortDir}|${rangeId}` });
  const rows = pagination.pageItems;

  /* ── shared styles ── */
  const panel = { background: CARD, borderRadius: '24px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)' };
  const pill = (kind) => ({ background: PILL[kind].bg, color: PILL[kind].color, padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' });
  const ctl = { border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px', fontSize: '12px', fontFamily: "'Poppins', sans-serif", background: CARD2, color: TEXT, outline: 'none' };
  const glassLabel = { alignSelf: 'center', background: 'rgba(255,255,255,0.28)', color: '#fff', borderRadius: '20px', padding: '3px 12px', fontSize: '10px', fontWeight: 500 };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: TEXT, margin: 0 }}>Payment Transactions</h2>
          <select value={rangeId} onChange={e => setRangeId(e.target.value)} style={{ ...ctl, cursor: 'pointer' }} aria-label="Date range">
            {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        {error && (
          <div role="alert" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Top metrics + volume chart */}
        <section style={{ ...panel, padding: '24px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '28px 40px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: '12px', color: MUTED }}>Total Collected</div>
            <div style={{ fontSize: '38px', fontWeight: 600, color: TEXT, letterSpacing: '-1px', marginTop: '18px', lineHeight: 1.1 }}>{peso(total)}</div>
            <div style={{ fontSize: '11px', color: MUTED, marginTop: '6px' }}>{inRange.length} transaction{inRange.length !== 1 ? 's' : ''} · {range.label.toLowerCase()}</div>
          </div>

          <div style={{ flex: '1 1 200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: MUTED }}>
              Today&apos;s Collection
              {changePct !== null && (
                <span style={{ background: changePct >= 0 ? (dark ? '#312e81' : '#c7d2fe') : PILL.failed.bg, color: changePct >= 0 ? (dark ? '#c7d2fe' : '#3730a3') : PILL.failed.color, borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: 600 }}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                </span>
              )}
            </div>
            <div style={{ fontSize: '38px', fontWeight: 600, color: TEXT, letterSpacing: '-1px', marginTop: '18px', lineHeight: 1.1 }}>{peso(todayTotal)}</div>
            <div style={{ fontSize: '11px', color: MUTED, marginTop: '6px' }}>vs. {peso(yesterdayTotal)} yesterday</div>
          </div>

          <div style={{ flex: '2 1 320px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: MUTED, marginBottom: '10px' }}>
              <span>Payment Volume</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px' }}>
                <i style={{ width: 8, height: 8, borderRadius: '50%', background: BAR_A, display: 'inline-block' }} /> Digital
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px' }}>
                <i style={{ width: 8, height: 8, borderRadius: '50%', background: BAR_B, display: 'inline-block' }} /> Cash
              </span>
            </div>
            <div role="img" aria-label="Daily payment volume" style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '110px' }}>
              {bars.list.map(b => {
                const h = Math.max(b.sum > 0 ? 6 : 0, (b.sum / bars.max) * 100);
                const ghost = 100 - h;
                const share = b.sum ? b.cash / b.sum : 0;
                return (
                  <div key={b.key} title={`${peso(b.sum)} — digital ${peso(b.digital)}, cash ${peso(b.cash)}`}
                    style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '2px' }}>
                    <div style={{ height: `${ghost}%`, borderRadius: '5px', background: `repeating-linear-gradient(135deg, ${GHOST} 0 2px, transparent 2px 5px)`, opacity: 0.6 }} />
                    {b.cash > 0 && <div style={{ height: `${h * share}%`, minHeight: '4px', borderRadius: '5px', background: BAR_B }} />}
                    {b.digital > 0 && <div style={{ height: `${h * (1 - share)}%`, minHeight: '4px', borderRadius: '5px', background: BAR_A }} />}
                    {b.sum === 0 && <div style={{ height: '4px', borderRadius: '5px', background: GHOST, opacity: 0.5 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Highlight cards + recent payments */}
        <section style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          {/* Payments today */}
          <div style={{ flex: '1 1 170px', minHeight: '210px', borderRadius: '24px', padding: '18px', color: '#fff', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg, #a5b4fc 0%, #c4b5fd 100%)' }}>
            <div style={{ fontSize: '30px', fontWeight: 600 }}>+{todayCount}</div>
            <div style={{ fontSize: '11px', opacity: 0.9 }}>Payments today</div>
            <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.28)', borderRadius: '14px', padding: '12px 14px' }}>
              <div style={{ fontSize: '17px', fontWeight: 600 }}>{peso(todayTotal)}</div>
              <div style={{ fontSize: '10px', opacity: 0.9 }}>Collected today</div>
            </div>
          </div>

          {/* Method share */}
          <div style={{ flex: '1 1 170px', minHeight: '210px', borderRadius: '24px', padding: '18px', color: '#fff', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #a5b4fc 0%, #fdba74 100%)' }}>
            <span style={glassLabel}>Top method</span>
            <div style={{ textAlign: 'center', marginTop: '18px' }}>
              <div style={{ fontSize: '34px', fontWeight: 500 }}>{methodShare.pct}%</div>
              <div style={{ fontSize: '11px', opacity: 0.9, textTransform: 'capitalize' }}>{methodShare.name} share</div>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px' }} aria-hidden="true">
              {bars.list.slice(-18).map(b => (
                <div key={b.key} style={{ flex: 1, height: `${Math.max(8, (b.sum / bars.max) * 100)}%`, borderRadius: '2px', background: 'rgba(255,255,255,0.55)' }} />
              ))}
            </div>
          </div>

          {/* Total revenue */}
          <div style={{ flex: '2 1 280px', minHeight: '210px', borderRadius: '24px', padding: '18px', color: '#fff', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #fdba74 0%, #fb7185 100%)' }}>
            <span style={glassLabel}>Total revenue</span>
            <div style={{ textAlign: 'center', marginTop: '22px' }}>
              <div style={{ fontSize: '40px', fontWeight: 300, letterSpacing: '-1px' }}>{peso(total)}</div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>{range.label}</div>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: '3px', height: '56px' }} aria-hidden="true">
              {bars.list.map(b => (
                <div key={b.key} style={{ flex: 1, height: `${Math.max(10, (b.sum / bars.max) * 100)}%`, borderRadius: '2px', background: 'rgba(255,255,255,0.5)' }} />
              ))}
            </div>
          </div>

          {/* Recent payments */}
          <div style={{ ...panel, flex: '1.4 1 280px', padding: '20px' }}>
            <div style={{ fontSize: '17px', fontWeight: 600, color: TEXT, marginBottom: '14px' }}>Recent Payments</div>
            {recent.length === 0 ? (
              <div style={{ color: MUTED, fontSize: '12px', padding: '24px 0' }}>No payments in this period.</div>
            ) : recent.map(p => {
              const st = statusOf(p);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColor(p.guestName), color: '#1f2937', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>{initials(p.guestName)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.guestName || 'Guest'}</div>
                    <div style={{ fontSize: '10px', color: MUTED, textTransform: 'capitalize' }}>Room {p.roomNumber || '—'} · {p.method || '—'}</div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: TEXT }}>{peso(p.amount)}</div>
                  <span style={pill(st)}>{PILL_LABEL[st]}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Transactions table */}
        <section style={{ ...panel, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <div style={{ fontSize: '17px', fontWeight: 600, color: TEXT }}>Recent Transactions</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <SortControls sortBy={sortBy} sortDir={sortDir} onSortBy={setSortBy} onSortDir={setSortDir} style={ctl} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by guest name or room..."
                style={{ ...ctl, width: '240px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', minWidth: '620px' }}>
              <thead>
                <tr>
                  {[['Guest', 'left'], ['Room', 'left'], ['Method', 'left'], ['Amount', 'right'], ['Status', 'right'], ['Date', 'right']].map(([h, align]) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: align, color: MUTED, fontWeight: 400, fontSize: '11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px 0', color: MUTED }}>No transactions found.</td></tr>
                ) : rows.map(p => {
                  const st = statusOf(p);
                  const ms = paymentDateMillis(p);
                  return (
                    <tr key={p.id} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = HOVER_BG; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(p.guestName), color: '#1f2937', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>{initials(p.guestName)}</div>
                          <span style={{ fontWeight: 600, color: TEXT }}>{p.guestName || 'Guest'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: TEXT }}>Room {p.roomNumber || '—'}</td>
                      <td style={{ padding: '12px', color: TEXT, textTransform: 'capitalize' }}>{p.method || '—'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: GREEN }}>{peso(p.amount, 2)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}><span style={pill(st)}>{PILL_LABEL[st]}</span></td>
                      <td style={{ padding: '12px', textAlign: 'right', color: MUTED, whiteSpace: 'nowrap' }}>
                        {ms ? formatDate(new Date(ms)) : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            pagination={pagination}
            itemLabel="transactions"
            colors={{ text: TEXT, muted: MUTED, border: BORDER, background: CARD, accent: TEXT, accentText: CARD }}
            style={{ padding: '12px 0 0' }}
          />
        </section>
      </div>
    </PageLayout>
  );
}