import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../firebase/firebase';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import DashboardSkeleton from '../components/DashboardSkeleton';
import { useSettings } from '../components/SettingsContext';
import { SortControls, sortRecords } from '../lib/listSort';
import { Pagination, usePagination } from '../../components/ui/pagination';
import StatusStepper from '../components/StatusStepper';
import EditBookingDialog from '../components/EditBookingDialog';
import { BOOKING_OPTIONS, getBookingOptionId } from '../../lib/bookingDetails';
import {
  DEFAULT_CHECKOUT_TIME,
  MAX_LATE_FEE,
  getLateFeeTotal,
  getOutstandingBalance as outstandingAmount,
  getOverstay,
  getStatusTransitionError,
  hasOutstandingBalance,
} from '../../lib/reservationStatus';

const QUICK_VIEWS = {
  new: { label: 'New bookings', sortBy: 'booked', sortDir: 'desc' },
  arrivals: { label: "Today's check-ins", sortBy: 'checkin', sortDir: 'asc' },
  departures: { label: "Today's check-outs", sortBy: 'booked', sortDir: 'desc' },
  'checked-in': { label: 'Currently checked in', status: 'checked-in', sortBy: 'checkin', sortDir: 'desc' },
  'checked-out': { label: 'Checked out', status: 'checked-out', sortBy: 'checkin', sortDir: 'desc' },
  'pending-payment': { label: 'Pending payments', sortBy: 'booked', sortDir: 'desc' },
  overstayed: { label: 'Overstayed guests', status: 'checked-in', sortBy: 'checkin', sortDir: 'asc' },
};

// Overstay rules (grace period, default check-out time) live in src/lib/reservationStatus.js.

const localToday = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Sends a staff status / overstay change to the server. Throws with the
// server's message when it refuses (e.g. an unpaid balance at check-out).
async function callReservationStatusApi(body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Your session has ended. Please sign in again.');
  const token = await user.getIdToken();
  const response = await fetch('/api/reservation-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The reservation could not be updated.');
  return result;
}

// Auto-release only applies to non-checked-in bookings. Checked-in guests past
// checkout must be handled by staff (overstay), never silently checked out.
const isAutoReleasable = (r) => {
  if (!r.checkOut || hasOutstandingBalance(r) || ['checked-out', 'cancelled', 'checked-in'].includes(r.status)) return false;
  const checkOut = new Date(`${r.checkOut}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !isNaN(checkOut.getTime()) && checkOut < today;
};

const matchesQuickView = (r, view, now = new Date()) => {
  if (view === 'overstayed') return !!getOverstay(r, now);
  if (view === 'arrivals') return r.checkIn === localToday() && r.status !== 'cancelled';
  if (view === 'departures') return r.checkOut === localToday() && r.status !== 'cancelled';
  if (view === 'pending-payment') return r.paymentStatus === 'pending' && r.status !== 'cancelled';
  if (view === 'new') return r.status !== 'cancelled';
  return true;
};

// One line in the Notifications card: title, short explanation and count.
// Click (or Enter/Space) to open the details and actions.
function NotificationGroup({ title, detail, count, color, t, children }) {
  return (
    <details style={{ background: t.CARD2, border: `1px solid ${t.BORDER2}`, borderRadius: 10 }}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', listStyle: 'none', fontSize: 12, color: t.TEXT }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong>{title}</strong>
          <span style={{ color: t.MUTED }}> · {detail}</span>
        </span>
        <span style={{ minWidth: 22, textAlign: 'center', borderRadius: 999, padding: '1px 8px', fontWeight: 700, background: color, color: '#fff' }}>{count}</span>
        <span aria-hidden="true" style={{ color: t.MUTED, fontSize: 11 }}>Details ▾</span>
      </summary>
      <div style={{ display: 'grid', gap: 8, padding: '4px 12px 12px', borderTop: `1px solid ${t.BORDER}` }}>
        {children}
      </div>
    </details>
  );
}

/* ════════════════════════════════════════════════════════════════
   Reservation board: List / Day / Week / Month views with filters
   ════════════════════════════════════════════════════════════════ */

const STATUS_COLOR = {
  pending: '#d97706',
  confirmed: '#16a34a',
  'checked-in': '#2563eb',
  'checked-out': '#9ca3af',
  cancelled: '#dc2626',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = n => String(n).padStart(2, '0');
const toIso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromIso = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const shortDate = d => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
// A stay covers every day from check-in through check-out (inclusive).
const staysOn = (r, day) => (r.checkIn && r.checkOut ? r.checkIn <= day && day <= r.checkOut : r.checkIn === day);
const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'G';

const monthGrid = (cursor) => {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i));
};

const tone = (t, name) => {
  const d = t.dark;
  const map = {
    green: [d ? 'rgba(134,239,172,.14)' : '#ecfdf3', d ? '#86efac' : '#15803d'],
    violet: [d ? 'rgba(196,181,253,.14)' : '#f3efff', d ? '#c4b5fd' : '#7c3aed'],
    amber: [d ? 'rgba(253,230,138,.14)' : '#fff7e0', d ? '#fde68a' : '#b45309'],
    red: [d ? 'rgba(252,165,165,.16)' : '#fee2e2', d ? '#fca5a5' : '#b91c1c'],
    blue: [d ? 'rgba(147,197,253,.14)' : '#e8f1ff', d ? '#93c5fd' : '#1d4ed8'],
    gray: [t.CARD2, t.MUTED],
  };
  return map[name] || map.gray;
};

function Tag({ t, c = 'gray', title, children }) {
  const [bg, color] = tone(t, c);
  return <span title={title} style={{ background: bg, color, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>;
}

function ReservationBoard({
  reservations, t, formatDate, now,
  getOverstay: overstayOf, isDelayedArrival, hasOutstandingBalance: owes, nights,
  onSelect, renderActions,
}) {
  const todayIso = toIso(now);
  const [tab, setTab] = useState('list'); // list | day | week | month
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(todayIso);
  const [scope, setScope] = useState('all'); // list tab only: all | day
  const [type, setType] = useState('all');
  const [pay, setPay] = useState('all');
  const [room, setRoom] = useState('all');

  const types = useMemo(() => [...new Set(reservations.map(r => r.type).filter(Boolean))], [reservations]);
  const rooms = useMemo(() => [...new Set(reservations.map(r => r.roomNumber).filter(Boolean))].sort(), [reservations]);

  const items = useMemo(() => reservations.filter(r =>
    (type === 'all' || r.type === type) &&
    (room === 'all' || r.roomNumber === room) &&
    (pay === 'all' || (pay === 'unpaid' ? owes(r) : !owes(r)))
  ), [reservations, type, room, pay, owes]);

  const selectedDate = fromIso(selected) || now;
  const grid = useMemo(() => monthGrid(cursor), [cursor]);
  const weekDays = useMemo(() => {
    const d = fromIso(selected) || now;
    return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay() + i));
  }, [selected, now]);

  const perDay = useMemo(() => {
    const map = {};
    [...grid, ...weekDays].forEach(d => { const k = toIso(d); if (!map[k]) map[k] = items.filter(r => staysOn(r, k)); });
    return map;
  }, [grid, weekDays, items]);

  const dayItems = items.filter(r => staysOn(r, selected));
  const listItems = scope === 'day' ? dayItems : items;
  const pagination = usePagination(listItems, { pageSize: 10, resetKey: `${type}|${pay}|${room}|${scope}|${selected}` });
  const visible = pagination.pageItems;
  const filtersActive = type !== 'all' || pay !== 'all' || room !== 'all';
  const showNav = tab !== 'list' || scope === 'day';

  const dayStats = {
    arriving: items.filter(r => r.checkIn === selected && r.status !== 'cancelled').length,
    departing: items.filter(r => r.checkOut === selected && r.status !== 'cancelled').length,
    inHouse: items.filter(r => r.status === 'checked-in' && staysOn(r, selected)).length,
  };

  const ctl = {
    background: t.CARD2, border: `1px solid ${t.BORDER2}`, borderRadius: 9, padding: '7px 10px',
    fontSize: 12, fontFamily: 'inherit', color: t.TEXT, outline: 'none', cursor: 'pointer',
  };
  const iconBtn = {
    width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.BORDER2}`, background: t.CARD2,
    color: t.TEXT, cursor: 'pointer', fontSize: 14, lineHeight: 1,
  };

  const moveDay = (n) => {
    const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + n);
    setSelected(toIso(d));
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const shift = (dir) => {
    if (tab === 'month') setCursor(c => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else if (tab === 'week') moveDay(7 * dir);
    else moveDay(dir);
  };
  const goToday = () => {
    setSelected(todayIso);
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  };
  const pickDay = (d, nextTab) => {
    setSelected(toIso(d));
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    if (tab === 'list') setScope('day');
    if (nextTab) setTab(nextTab);
  };

  const title = tab === 'month'
    ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : tab === 'week'
      ? `${shortDate(weekDays[0])} – ${shortDate(weekDays[6])}, ${weekDays[6].getFullYear()}`
      : (tab === 'day' || scope === 'day')
        ? `${DOW_LONG[selectedDate.getDay()]}, ${shortDate(selectedDate)}`
        : 'All reservations';

  // ── Mini calendar sidebar ──
  const sidebar = (
    <aside style={{ width: 250, flex: '0 0 auto', borderRight: `1px solid ${t.BORDER}`, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" aria-label="Previous month" style={iconBtn}
          onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>‹</button>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.TEXT }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
        <button type="button" aria-label="Next month" style={iconBtn}
          onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {DOW.map((d, i) => <div key={i} style={{ fontSize: 10, color: t.MUTED, padding: '4px 0' }}>{d}</div>)}
        {grid.map(d => {
          const k = toIso(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isSel = showNav && k === selected;
          const count = perDay[k]?.length || 0;
          return (
            <button key={k} type="button" onClick={() => pickDay(d)}
              style={{
                position: 'relative', height: 30, borderRadius: 999,
                border: k === todayIso && !isSel ? `1px solid ${t.ACCENT}` : '1px solid transparent',
                background: isSel ? t.ACCENT : 'transparent', color: isSel ? t.ACCENT_TEXT : inMonth ? t.TEXT : t.MUTED,
                opacity: inMonth ? 1 : 0.5, fontSize: 11, fontWeight: count ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {d.getDate()}
              {count > 0 && !isSel && <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 999, background: t.ACCENT }} />}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 18, fontSize: 11, fontWeight: 700, color: t.TEXT }}>
        {selected === todayIso ? 'Today' : formatDate(selected)}
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {[['Arriving', dayStats.arriving, 'green'], ['Departing', dayStats.departing, 'amber'], ['In house', dayStats.inHouse, 'blue']].map(([label, n, c]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.CARD2, borderRadius: 9, padding: '8px 10px', fontSize: 12, color: t.TEXT }}>
            {label}<Tag t={t} c={c}>{n}</Tag>
          </div>
        ))}
      </div>
    </aside>
  );

  // ── Reservation row (used by List and Day views) ──
  const row = (r) => {
    const color = STATUS_COLOR[r.status] || '#9ca3af';
    const overstay = overstayOf(r, now);
    const unpaid = owes(r);
    return (
      <div key={r.id} role="button" tabIndex={0} onClick={() => onSelect(r.id)}
        onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(r.id); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: t.CARD, border: `1px solid ${t.BORDER}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
        <div style={{ width: 78, flex: '0 0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.TEXT }}>{r.checkInTime || '2:00 PM'}</div>
          <div style={{ fontSize: 11, color: t.MUTED, marginTop: 2 }}>{r.checkOutTime || '12:00 PM'}</div>
        </div>
        <div style={{ width: 3, alignSelf: 'stretch', minHeight: 44, borderRadius: 3, background: color, flex: '0 0 auto' }} />
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.TEXT }}>
            {r.guestName || 'Guest'} <span style={{ fontSize: 10, color: t.MUTED, fontWeight: 500 }}>#{r.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
            <Tag t={t} c="green">Room {r.roomNumber || '—'}{r.roomType ? ` · ${r.roomType}` : ''}</Tag>
            {r.type && <Tag t={t} c="violet"><span style={{ textTransform: 'capitalize' }}>{r.type}</span></Tag>}
            <Tag t={t}>{r.checkOut && r.checkOut !== r.checkIn ? `${formatDate(r.checkIn)} – ${formatDate(r.checkOut)}` : formatDate(r.checkIn)}</Tag>
            <Tag t={t}>{nights(r)}</Tag>
            <Tag t={t} c={unpaid ? 'amber' : 'green'}>{unpaid ? 'Unpaid' : 'Paid'}</Tag>
            {r.cancellationRequested && <Tag t={t} c="red">Cancellation requested</Tag>}
            {isDelayedArrival(r) && <Tag t={t} c="amber" title="Guest has not checked in yet">Delayed arrival</Tag>}
            {overstay && <Tag t={t} c="red" title="Still checked in past check-out time">Overstayed {overstay.label}</Tag>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 150, flex: '0 0 auto' }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: color }}>{initials(r.guestName)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: t.TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.phone || 'No phone'}</div>
            <div style={{ fontSize: 10, color: t.MUTED, textTransform: 'capitalize' }}>{r.status}</div>
          </div>
        </div>
        <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} style={{ flex: '0 0 auto', cursor: 'default' }}>
          {renderActions(r)}
        </div>
      </div>
    );
  };

  // ── Compact chip (Week and Month views) ──
  const chip = (r, k) => (
    <button key={r.id} type="button" onClick={() => onSelect(r.id)}
      title={`${r.guestName || 'Guest'} · Room ${r.roomNumber || '—'} · ${r.status}`}
      style={{
        textAlign: 'left', border: 'none', borderLeft: `3px solid ${STATUS_COLOR[r.status] || '#9ca3af'}`, borderRadius: 4,
        background: t.CARD2, color: t.TEXT, fontSize: 10, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%',
        textDecoration: r.status === 'cancelled' ? 'line-through' : 'none',
      }}>
      {r.checkIn === k ? '▸ ' : r.checkOut === k ? '◂ ' : ''}{r.guestName || 'Guest'} · {r.roomNumber || '—'}
    </button>
  );

  const legend = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 11, color: t.MUTED }}>
      {Object.entries(STATUS_COLOR).map(([s, c]) => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'capitalize' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{s}
        </span>
      ))}
      <span>▸ check-in day · ◂ check-out day</span>
    </div>
  );

  const empty = (text) => <div style={{ textAlign: 'center', padding: '48px 12px', color: t.MUTED, fontSize: 13 }}>{text}</div>;

  // ── Day view: arriving / departing / staying ──
  const dayView = (() => {
    const live = dayItems.filter(r => r.status !== 'cancelled');
    const groups = [
      ['Arriving', live.filter(r => r.checkIn === selected)],
      ['Departing', live.filter(r => r.checkIn !== selected && r.checkOut === selected)],
      ['Staying', live.filter(r => r.checkIn !== selected && r.checkOut !== selected)],
      ['Cancelled', dayItems.filter(r => r.status === 'cancelled')],
    ].filter(g => g[1].length);
    if (!groups.length) return empty('No reservations on this day.');
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {groups.map(([label, list]) => (
          <section key={label}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.TEXT, marginBottom: 8 }}>{label} <span style={{ color: t.MUTED, fontWeight: 500 }}>({list.length})</span></div>
            <div style={{ display: 'grid', gap: 10 }}>{list.map(row)}</div>
          </section>
        ))}
      </div>
    );
  })();

  // ── Week view: seven day columns ──
  const weekView = (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 840, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: `1px solid ${t.BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        {weekDays.map((d, i) => {
          const k = toIso(d);
          const list = perDay[k] || [];
          return (
            <div key={k} style={{ minHeight: 280, background: t.CARD, borderRight: i < 6 ? `1px solid ${t.BORDER}` : 'none' }}>
              <button type="button" onClick={() => pickDay(d, 'day')} title="Open this day"
                style={{ width: '100%', border: 'none', borderBottom: `1px solid ${t.BORDER}`, background: k === selected ? t.CARD2 : 'transparent', padding: '10px 8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: t.MUTED }}>{DOW_LONG[d.getDay()]}</div>
                <div style={{ display: 'inline-grid', placeItems: 'center', width: 28, height: 28, borderRadius: 999, marginTop: 2, fontSize: 13, fontWeight: 700, background: k === todayIso ? t.ACCENT : 'transparent', color: k === todayIso ? t.ACCENT_TEXT : t.TEXT }}>{d.getDate()}</div>
                <div style={{ fontSize: 10, color: t.MUTED, marginTop: 2 }}>{list.length} booking{list.length !== 1 ? 's' : ''}</div>
              </button>
              <div style={{ display: 'grid', gap: 4, padding: 6 }}>
                {list.map(r => chip(r, k))}
              </div>
            </div>
          );
        })}
      </div>
      {legend}
    </div>
  );

  // ── Month view ──
  const monthView = (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 720, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: `1px solid ${t.BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        {DOW_LONG.map(d => (
          <div key={d} style={{ padding: '8px 10px', fontSize: 11, color: t.MUTED, background: t.CARD2, borderBottom: `1px solid ${t.BORDER}` }}>{d}</div>
        ))}
        {grid.map((d, i) => {
          const k = toIso(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const list = perDay[k] || [];
          return (
            <div key={k} style={{
              minHeight: 112, padding: 6, background: t.CARD, opacity: inMonth ? 1 : 0.55,
              borderRight: i % 7 === 6 ? 'none' : `1px solid ${t.BORDER}`, borderBottom: i >= 35 ? 'none' : `1px solid ${t.BORDER}`,
            }}>
              <button type="button" onClick={() => pickDay(d, 'day')} title="Open this day"
                style={{
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, width: 24, height: 24, borderRadius: 999,
                  background: k === todayIso ? t.ACCENT : 'transparent', color: k === todayIso ? t.ACCENT_TEXT : t.TEXT,
                }}>{d.getDate()}</button>
              <div style={{ display: 'grid', gap: 3, marginTop: 4 }}>
                {list.slice(0, 3).map(r => chip(r, k))}
                {list.length > 3 && (
                  <button type="button" onClick={() => pickDay(d, 'day')}
                    style={{ textAlign: 'left', border: 'none', background: 'transparent', color: t.MUTED, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', padding: '1px 4px' }}>
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {legend}
    </div>
  );

  const listView = (
    <div style={{ display: 'grid', gap: 10 }}>
      {visible.length === 0
        ? empty(scope === 'day' ? 'No reservations on this day. Pick another date or switch to All dates.' : 'No reservations match these filters.')
        : visible.map(row)}
      <Pagination
        pagination={pagination}
        itemLabel="reservations"
        colors={{ text: t.TEXT, muted: t.MUTED, border: t.BORDER2, background: t.CARD2, accent: t.ACCENT, accentText: t.ACCENT_TEXT }}
        style={{ padding: '4px 0 0' }}
      />
    </div>
  );

  return (
    <div style={{ background: t.CARD, border: `1px solid ${t.BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {tab !== 'month' && sidebar}

        <div style={{ flex: '1 1 460px', minWidth: 0, padding: 16 }}>
          {/* Title, navigation, view tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: t.TEXT }}>{title}</div>
              {showNav && (
                <>
                  <button type="button" aria-label="Previous" style={iconBtn} onClick={() => shift(-1)}>‹</button>
                  <button type="button" aria-label="Next" style={iconBtn} onClick={() => shift(1)}>›</button>
                  <button type="button" style={{ ...ctl, fontWeight: 600 }} onClick={goToday}>Today</button>
                </>
              )}
            </div>
            <div role="tablist" aria-label="Reservation view" style={{ display: 'inline-flex', background: t.CARD2, border: `1px solid ${t.BORDER2}`, borderRadius: 10, padding: 3 }}>
              {[['list', 'List'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  style={{
                    border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: tab === id ? t.ACCENT : 'transparent', color: tab === id ? t.ACCENT_TEXT : t.MUTED,
                  }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <select aria-label="Booking type" value={type} onChange={e => { setType(e.target.value); }} style={ctl}>
              <option value="all">All types</option>
              {types.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select aria-label="Payment" value={pay} onChange={e => { setPay(e.target.value); }} style={ctl}>
              <option value="all">Any payment</option>
              <option value="paid">Fully paid</option>
              <option value="unpaid">Unpaid balance</option>
            </select>
            <select aria-label="Room" value={room} onChange={e => { setRoom(e.target.value); }} style={ctl}>
              <option value="all">All rooms</option>
              {rooms.map(v => <option key={v} value={v}>Room {v}</option>)}
            </select>
            {filtersActive && (
              <button type="button" style={{ ...ctl, color: t.MUTED }} onClick={() => { setType('all'); setPay('all'); setRoom('all'); }}>Clear filters</button>
            )}
            {tab === 'list' && (
              <div style={{ marginLeft: 'auto', display: 'inline-flex', background: t.CARD2, border: `1px solid ${t.BORDER2}`, borderRadius: 9, padding: 2 }}>
                {[['all', 'All dates'], ['day', 'Selected day']].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => { setScope(id); }}
                    style={{
                      border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      background: scope === id ? t.CARD : 'transparent', color: scope === id ? t.TEXT : t.MUTED,
                    }}>{label}</button>
                ))}
              </div>
            )}
          </div>

          {tab === 'list' && listView}
          {tab === 'day' && dayView}
          {tab === 'week' && weekView}
          {tab === 'month' && monthView}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Reservations page
   ════════════════════════════════════════════════════════════════ */

export default function Reservations() {
  const navigate = useNavigate();
  const { settings, formatDate } = useSettings();
  const dark = settings?.darkMode;
  const initialBookingQuery = (() => {
    try {
      return new URLSearchParams(window.location.search).get('booking') || '';
    } catch {
      return '';
    }
  })();

  const initialView = (() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view');
      return QUICK_VIEWS[v] ? v : '';
    } catch {
      return '';
    }
  })();

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const BG       = dark ? '#020b09' : '#f4f6f4';
  const CARD     = dark ? '#1c1c1c' : '#ffffff';
  const CARD2    = dark ? '#282827' : '#f4f6f4';
  const BORDER   = dark ? '#2a2a28' : '#e5e7eb';
  const BORDER2  = dark ? '#3a3a38' : '#e5e7eb';
  const ROWLINE  = dark ? '#242422' : '#f3f4f6';
  const TEXT     = dark ? '#f0f0f0' : '#111827';
  const MUTED    = dark ? '#9ca3af' : '#6b7280';
  const ACCENT   = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';

  // ── Role detection (based on route; swap for real auth/role context if available) ──
  const isReceptionist = window.location.pathname.startsWith('/receptionist');
  const isAdmin = !isReceptionist;

  const [reservations, setReservations] = useState([]);
  const [toast, setToast] = useState(null);
  const [cancelDialog, setCancelDialog] = useState(null);
  const [statusBusyId, setStatusBusyId] = useState('');
  const [lateFeeDialog, setLateFeeDialog] = useState(null); // { reservation, amount, note }
  const [lateFeeBusy, setLateFeeBusy] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // reservation being edited
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState('');
  const [manualTotals, setManualTotals] = useState({});
  const [manualRefunds, setManualRefunds] = useState({});
  const [filter, setFilter]             = useState(QUICK_VIEWS[initialView]?.status || 'all');
  const [quickView, setQuickView]       = useState(initialView);
  const [sortBy, setSortBy]             = useState(QUICK_VIEWS[initialView]?.sortBy || 'booked');
  const [sortDir, setSortDir]           = useState(QUICK_VIEWS[initialView]?.sortDir || 'desc');
  const [search, setSearch]             = useState(initialBookingQuery);
  const [selectedId, setSelectedId]     = useState(null);
  const [autoOpened, setAutoOpened]     = useState(false);
  const [loaded, setLoaded]             = useState(false);
  const [now, setNow]                   = useState(() => new Date());
  const notifiedRef = useRef(new Set());
  const toastedRef  = useRef(false);

  // Re-evaluate overstays every minute without needing a page reload
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Past bookings with nothing owed are closed out through the server, which
  // re-checks the balance and sets the room to cleaning.
  const releaseExpiredRooms = useCallback(async (expired) => {
    await Promise.all(expired.map(async reservation => {
      try {
        await callReservationStatusApi({ action: 'close-expired', reservationId: reservation.id });
      } catch (err) {
        console.warn('Expired room release skipped:', err.message);
      }
    }));
  }, []);

  const fetchReservations = useCallback(async () => {
    const snap = await getDocs(collection(db, 'reservations'));
    let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isAdmin) {
      const expired = data.filter(isAutoReleasable);
      if (expired.length) {
        await releaseExpiredRooms(expired);
        const ids = new Set(expired.map(r => r.id));
        data = data.map(r => ids.has(r.id) ? { ...r, status: 'checked-out' } : r);
      }
    }
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setReservations(data);
  }, [isAdmin, releaseExpiredRooms]);

  useEffect(() => {
    fetchReservations();
    const unsubscribe = onSnapshot(collection(db, 'reservations'), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReservations(data);
      setLoaded(true);
    }, error => {
      console.error('Unable to watch reservation status changes:', error);
      setLoaded(true);
      setToast({ type: 'error', text: 'Reservation updates could not be loaded.' });
    });
    return unsubscribe;
  }, [fetchReservations]);

  useEffect(() => {
    if (autoOpened || !initialBookingQuery || reservations.length === 0) return;
    const match = reservations.find(r => r.id === initialBookingQuery);
    if (match) setSelectedId(match.id);
    setAutoOpened(true);
  }, [autoOpened, initialBookingQuery, reservations]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = event => { if (event.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // ── Overstay detection + notifications (admin and receptionist) ──
  const overstayed = useMemo(
    () => reservations.map(r => ({ r, info: getOverstay(r, now) })).filter(x => x.info),
    [reservations, now]
  );

  useEffect(() => {
    if (!overstayed.length) return;

    // 1) Toast once per session, visible to both roles
    if (!toastedRef.current) {
      toastedRef.current = true;
      setToast(t => t || {
        type: 'error',
        text: `${overstayed.length} guest${overstayed.length > 1 ? 's have' : ' has'} overstayed past check-out time.`,
      });
    }

    // 2) Persistent notification, one doc per overstay (deterministic ID, so no duplicates)
    overstayed.forEach(async ({ r }) => {
      const key = `overstay-${r.id}-${r.checkOut}`;
      if (notifiedRef.current.has(key)) return;
      notifiedRef.current.add(key);
      try {
        const ref = doc(db, 'notifications', key);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            type: 'overstay',
            reservationId: r.id,
            guestName: r.guestName || 'Guest',
            roomNumber: r.roomNumber || null,
            scheduledCheckOut: r.checkOut,
            message: `${r.guestName || 'Guest'} (Room ${r.roomNumber || '—'}) has overstayed past check-out.`,
            audience: ['admin', 'receptionist'],
            resolved: false,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('Overstay notification could not be saved:', err.message);
      }
    });
  }, [overstayed]);

  const openCancellationDialog = (kind, reservation) => {
    setCancelReason(kind === 'approve' ? reservation.cancellationReason || '' : '');
    setCancelDialog({ kind, reservation });
  };

  // Changes a reservation's status on the server. The server enforces the
  // rules (unpaid balance at check-out, receptionist limits) and updates the
  // room; the live listener then refreshes the list. Cancellations re-throw
  // so the cancel dialog can show the error.
  const updateStatus = async (id, status, reason = '') => {
    const reservation = reservations.find(r => r.id === id);
    if (!reservation || reservation.status === status) return;
    if (isReceptionist && reservation.status === 'cancelled') return;
    // Same one-step-at-a-time rule the server enforces.
    const transitionError = getStatusTransitionError(reservation.status, status);
    if (transitionError) {
      setToast({ type: 'error', text: transitionError });
      if (status === 'cancelled') throw new Error(transitionError);
      return;
    }
    let force = false;
    let statusReason = reason;
    if (status === 'checked-out' && hasOutstandingBalance(reservation)) {
      const owedText = `₱${outstandingAmount(reservation).toLocaleString()}`;
      if (!isAdmin) {
        setToast({ type: 'error', text: `This guest still owes ${owedText}. Collect payment in Billing before checking out.` });
        return;
      }
      const overrideReason = window.prompt(`This guest still owes ${owedText}. To check them out anyway, enter a reason (it is saved on the booking):`);
      if (!overrideReason || !overrideReason.trim()) return;
      force = true;
      statusReason = overrideReason.trim();
    }
    setStatusBusyId(id);
    try {
      const result = await callReservationStatusApi({ action: 'set-status', reservationId: id, status, reason: statusReason, force });
      // Show the change right away; the live listener will confirm it.
      setReservations(list => list.map(r => (r.id === id ? { ...r, status } : r)));
      if (status === 'cancelled') return;
      if (status === 'checked-out') {
        setToast({
          type: 'success',
          text: `Guest has checked out${result.overstayMinutes ? ' (late check-out recorded)' : ''}. ${reservation.roomName || 'The room'} is now under cleaning/maintenance.`,
        });
      }
      if (status === 'checked-out' && reservation.status !== 'checked-out') {
        try {
          const token = await auth.currentUser.getIdToken();
          await fetch('/api/send-thank-you', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reservationId: id }),
          });
        } catch (thankYouError) {
          console.warn('Thank-you email skipped:', thankYouError.message);
        }
      }
      if (status === 'confirmed' && reservation?.status !== 'confirmed') {
        try {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch('/api/send-reservation-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reservationId: id }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'Confirmation email could not be sent.');
          setToast({ type: 'success', text: result.sent ? 'Booking confirmation email sent.' : result.alreadySent ? 'Booking confirmation email was already sent.' : 'Confirmation email is being sent.' });
        } catch (emailError) {
          setToast({ type: 'error', text: emailError.message || 'Confirmation email failed to send.' });
        }
      }
      await fetchReservations();
    } catch (error) {
      if (status === 'cancelled') throw error;
      setToast({ type: 'error', text: error.message || 'Reservation status could not be updated.' });
    } finally {
      setStatusBusyId('');
    }
  };

  // ── Overstay handling ──
  const flagOverstay = async (reservation) => {
    setStatusBusyId(reservation.id);
    try {
      await callReservationStatusApi({ action: 'flag-overstay', reservationId: reservation.id });
      setToast({ type: 'success', text: `${reservation.guestName || 'Guest'} is flagged as overstayed.` });
    } catch (error) {
      setToast({ type: 'error', text: error.message });
    } finally {
      setStatusBusyId('');
    }
  };

  const submitLateFee = async () => {
    if (!lateFeeDialog || lateFeeBusy) return;
    const amount = Number(lateFeeDialog.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_LATE_FEE) {
      setToast({ type: 'error', text: `Enter a late check-out charge between ₱1 and ₱${MAX_LATE_FEE.toLocaleString()}.` });
      return;
    }
    setLateFeeBusy(true);
    try {
      const result = await callReservationStatusApi({
        action: 'add-late-fee',
        reservationId: lateFeeDialog.reservation.id,
        amount,
        note: lateFeeDialog.note,
      });
      setLateFeeDialog(null);
      setToast({ type: 'success', text: `Late check-out charge of ₱${amount.toLocaleString()} added. Balance due: ₱${Math.max(0, result.balance).toLocaleString()}.` });
    } catch (error) {
      setToast({ type: 'error', text: error.message });
    } finally {
      setLateFeeBusy(false);
    }
  };

  // ── Cancellation request flow (receptionist requests, admin approves/denies) ──
  const requestCancellation = async (id, reason) => {
    await updateDoc(doc(db, 'reservations', id), {
      cancellationRequested: true,
      cancellationRequestedBy: auth.currentUser?.uid || null,
      cancellationRequestedAt: serverTimestamp(),
      cancellationReason: reason.trim(),
    });
    await fetchReservations();
  };

  const decideRequest = async (action, reservation, extra = {}) => {
    const request = action.includes('refund')
      ? { requestId: reservation.refundRequestId }
      : { requestId: reservation.modificationRequest?.id };
    if (!request.requestId) {
      setToast({ type: 'error', text: 'This request no longer has a valid reference.' });
      return;
    }
    let reason = '';
    if (['reject-refund', 'reject-modification', 'review-refund'].includes(action)) {
      reason = window.prompt('Add a reason for the decision:') || '';
      if (action !== 'review-refund' && !reason.trim()) return;
    }
    setDecisionBusy(reservation.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in again before reviewing requests.');
      const response = await fetch('/api/reservation-staff-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          reservationId: reservation.id,
          ...request,
          reason,
          ...extra,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not process the decision.');
      setToast({
        type: 'success',
        text: result.checkoutUrl
          ? 'Approved. The secure payment link was emailed to the guest.'
          : action.includes('refund')
            ? 'Refund decision recorded; the case remains open until PayMongo confirms processing.'
            : `Schedule change ${result.status === 'rejected' ? 'rejected' : 'approved'}.`,
      });
      await fetchReservations();
    } catch (error) {
      setToast({ type: 'error', text: error.message || 'Could not process the decision.' });
    } finally {
      setDecisionBusy('');
    }
  };

  const approveCancellation = async (reservation, reason) => {
    await callReservationStatusApi({ action: 'set-status', reservationId: reservation.id, status: 'cancelled', reason: reason.trim() });
    await fetchReservations();
  };

  const denyCancellation = async (id) => {
    await updateDoc(doc(db, 'reservations', id), { cancellationRequested: false });
    fetchReservations();
  };

  const confirmCancellation = async () => {
    if (!cancelDialog || cancelBusy) return;
    setCancelBusy(true);
    try {
      if (cancelDialog.kind === 'request') {
        await requestCancellation(cancelDialog.reservation.id, cancelReason);
      } else if (cancelDialog.kind === 'approve') {
        await approveCancellation(cancelDialog.reservation, cancelReason);
      } else {
        await updateStatus(cancelDialog.reservation.id, 'cancelled', cancelReason);
      }
      setCancelDialog(null);
      setToast({ type: 'success', text: cancelDialog.kind === 'request' ? 'Cancellation request submitted.' : 'Reservation cancelled.' });
    } catch (error) {
      console.error('Unable to complete reservation cancellation:', error);
      setToast({ type: 'error', text: error.message || 'Cancellation could not be completed.' });
    } finally {
      setCancelBusy(false);
    }
  };

  // Badges: dark, saturated bg + light text in dark mode; light, tinted bg + dark saturated text in light mode
  const statusBadge = (status) => {
    const map = {
      confirmed:     { dbg: '#14532d', dtext: '#86efac', lbg: '#dcfce7', ltext: '#15803d' },
      'checked-in':  { dbg: '#1e3a5f', dtext: '#93c5fd', lbg: '#dbeafe', ltext: '#1d4ed8' },
      'checked-out': { dbg: '#282827', dtext: '#9ca3af', lbg: '#f3f4f6', ltext: '#4b5563' },
      cancelled:     { dbg: '#7f1d1d', dtext: '#fca5a5', lbg: '#fee2e2', ltext: '#b91c1c' },
      pending:       { dbg: '#78350f', dtext: '#fde68a', lbg: '#fef3c7', ltext: '#b45309' },
    };
    const c = map[status] || { dbg: '#282827', dtext: '#9ca3af', lbg: '#f3f4f6', ltext: '#4b5563' };
    return dark ? { bg: c.dbg, color: c.dtext } : { bg: c.lbg, color: c.ltext };
  };

  // Confirmed guests who have not checked in once the scheduled check-in time has passed.
  const isDelayedArrival = (r) => {
    if (r.status !== 'confirmed' || !r.checkIn) return false;
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    if (r.checkIn < today) return true;
    if (r.checkIn > today) return false;
    const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(r.checkInTime || '2:00 PM');
    let hours = match ? Number(match[1]) % 12 : 14;
    if (match && match[3].toUpperCase() === 'PM') hours += 12;
    const minutes = match ? Number(match[2]) : 0;
    return n.getHours() * 60 + n.getMinutes() > hours * 60 + minutes;
  };

  // Day / night tours show their tour type; overnight stays show nights.
  const nights = (r) => {
    if (!r.checkIn || !r.checkOut) return '—';
    if (r.bookingType === 'daytour') {
      const label = r.tourPeriod === 'night' ? 'Night tour' : 'Day tour';
      const days = Math.max(1, Number(r.nights) || 1);
      return days > 1 ? `${label} · ${days} days` : label;
    }
    const n = Math.ceil((new Date(r.checkOut) - new Date(r.checkIn)) / (1000 * 60 * 60 * 24));
    return `${n} night${n !== 1 ? 's' : ''}`;
  };

  const selectedReservation = selectedId ? reservations.find(r => r.id === selectedId) : null;
  const lateArrivals = reservations.filter(isDelayedArrival);

  const filtered = sortRecords(reservations.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter;
    const matchQuick = !quickView || matchesQuickView(r, quickView, now);
    // Guest, room, phone, email, status or booking reference (with or without #).
    const term = search.trim().toLowerCase().replace(/^#/, '');
    const matchSearch = !term || [r.guestName, r.roomNumber, r.phone, r.email, r.status, r.id]
      .some(value => String(value || '').toLowerCase().includes(term));
    return matchFilter && matchQuick && matchSearch;
  }), sortBy, sortDir);

  const clearQuickView = () => {
    setQuickView('');
    setFilter('all');
    window.history.replaceState(null, '', window.location.pathname);
  };

  const inp = {
    background: CARD2, border: `1px solid ${BORDER2}`,
    borderRadius: '10px', padding: '9px 14px',
    fontSize: '12px', fontFamily: "'Poppins', sans-serif",
    color: TEXT, outline: 'none', cursor: 'pointer',
  };

  // Status stepper shown on every row and in the booking details. Clicking a
  // step saves the new status through the server. Receptionists can't change
  // cancelled bookings and request cancellations instead of cancelling.
  const stepperColors = { text: TEXT, muted: MUTED, border: BORDER2, background: CARD, accent: ACCENT, accentText: ACCENT_TEXT };
  const renderStepper = (r, compact) => {
    const lockedReason = isReceptionist && r.status === 'cancelled'
      ? 'Cancelled bookings can only be changed by an admin.'
      : isReceptionist && r.cancellationRequested ? 'Cancellation requested — waiting for an admin.' : '';
    const owes = hasOutstandingBalance(r);
    return (
      <StatusStepper
        status={r.status}
        compact={compact}
        busy={statusBusyId === r.id}
        lockedReason={lockedReason}
        colors={stepperColors}
        stepNotes={owes ? {
          'checked-out': `Guest owes ₱${outstandingAmount(r).toLocaleString()}. Collect payment first${isAdmin ? ', or override with a reason' : ''}.`,
        } : {}}
        getStepError={to => getStatusTransitionError(r.status, to)}
        onSelect={status => updateStatus(r.id, status)}
        onCancel={() => openCancellationDialog(isReceptionist ? 'request' : 'cancel', r)}
        cancelLabel={isReceptionist ? 'Request cancellation' : 'Cancel booking'}
      />
    );
  };
  const renderActions = (r) => (
    <div onClick={event => event.stopPropagation()} style={{ minWidth: 190 }}>{renderStepper(r, true)}</div>
  );
  const canEditBooking = r => ['pending', 'confirmed', 'checked-in'].includes(r.status) && r.type !== 'corporate' && Boolean(r.roomId);

  const pendingCancellations = reservations.filter(r => r.cancellationRequested);
  const pendingRefunds = isAdmin ? reservations.filter(r =>
    ['eligible', 'needs_review'].includes(String(r.refundRequestStatus || '').toLowerCase())) : [];
  const pendingModifications = reservations.filter(r =>
    ['requested', 'needs_review'].includes(String(r.modificationRequest?.status || '').toLowerCase()));

  if (!loaded) return <PageLayout><DashboardSkeleton /></PageLayout>;

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>

        {toast && (
          <div role="status" onClick={() => setToast(null)}
            style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1000, maxWidth: '360px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', background: toast.type === 'error' ? '#fee2e2' : '#dcfce7', color: toast.type === 'error' ? '#991b1b' : '#166534', border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: '12px' }}>
            {toast.text}
          </div>
        )}

        {editTarget && (
          <EditBookingDialog
            reservation={editTarget}
            colors={{ CARD, CARD2, BORDER, BORDER2, TEXT, MUTED, ACCENT, ACCENT_TEXT }}
            onClose={() => setEditTarget(null)}
            onSaved={result => {
              setEditTarget(null);
              setToast({
                type: 'success',
                text: `Booking updated. New total ₱${Number(result.totalAmount).toLocaleString()}.${result.overpaid > 0 ? ` The guest overpaid ₱${Number(result.overpaid).toLocaleString()}; arrange a refund.` : ''}`,
              });
              fetchReservations();
            }}
          />
        )}

        {lateFeeDialog && (
          <div role="presentation" onClick={event => { if (event.target === event.currentTarget && !lateFeeBusy) setLateFeeDialog(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: '16px' }}>
            <form role="dialog" aria-modal="true" aria-labelledby="late-fee-title"
              onSubmit={event => { event.preventDefault(); submitLateFee(); }}
              style={{ width: '100%', maxWidth: '400px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '20px', display: 'grid', gap: '12px' }}>
              <div id="late-fee-title" style={{ fontWeight: 700, fontSize: '15px', color: TEXT }}>Add late check-out charge</div>
              <div style={{ fontSize: '12px', color: MUTED }}>
                {lateFeeDialog.reservation.guestName || 'Guest'} · Room {lateFeeDialog.reservation.roomNumber || '—'}. The charge is added to the guest's bill and must be paid before check-out.
              </div>
              <label style={{ display: 'grid', gap: '5px', fontSize: '11px', fontWeight: 600, color: MUTED }}>
                Amount (₱)
                <input type="number" min="1" max={MAX_LATE_FEE} step="0.01" required autoFocus value={lateFeeDialog.amount}
                  onChange={e => setLateFeeDialog(d => ({ ...d, amount: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: 'grid', gap: '5px', fontSize: '11px', fontWeight: 600, color: MUTED }}>
                Note (optional)
                <input type="text" maxLength={300} value={lateFeeDialog.note}
                  onChange={e => setLateFeeDialog(d => ({ ...d, note: e.target.value }))} style={inp} />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setLateFeeDialog(null)} disabled={lateFeeBusy}
                  style={{ ...inp, fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={lateFeeBusy}
                  style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: '10px', padding: '9px 14px', fontSize: '12px', fontWeight: 700, cursor: lateFeeBusy ? 'wait' : 'pointer' }}>
                  {lateFeeBusy ? 'Adding…' : 'Add charge'}
                </button>
              </div>
            </form>
          </div>
        )}

        {cancelDialog && (
          <div role="presentation" onClick={event => {
            if (event.target === event.currentTarget && !cancelBusy) setCancelDialog(null);
          }} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.48)', display: 'grid', placeItems: 'center', padding: '18px' }}>
            <section role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title"
              style={{ width: '100%', maxWidth: '440px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '22px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h2 id="cancel-dialog-title" style={{ color: TEXT, fontSize: '17px', margin: '0 0 10px' }}>
                {cancelDialog.kind === 'request' ? 'Request reservation cancellation?' : 'Cancel this reservation?'}
              </h2>
              <p style={{ color: MUTED, fontSize: '13px', margin: '0 0 16px' }}>
                Are you sure you want to cancel the reservation for {cancelDialog.reservation.guestName || 'this guest'} (Room {cancelDialog.reservation.roomNumber || '—'})?
                {cancelDialog.kind === 'request' && ' This will send a request to an administrator for approval.'}
              </p>
              <label htmlFor="cancellation-reason" style={{ display: 'block', color: MUTED, fontSize: '12px', marginBottom: '6px' }}>Reason (optional)</label>
              <textarea id="cancellation-reason" value={cancelReason} onChange={event => setCancelReason(event.target.value)}
                rows={3} maxLength={500} disabled={cancelBusy} placeholder="Enter a reason for cancellation"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1px solid ${BORDER2}`, borderRadius: '9px', padding: '10px', color: TEXT, background: CARD2, font: 'inherit', fontSize: '13px' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', marginTop: '18px' }}>
                <button type="button" disabled={cancelBusy} onClick={() => setCancelDialog(null)}
                  style={{ border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '9px 14px', background: CARD2, color: TEXT, cursor: 'pointer' }}>Keep reservation</button>
                <button type="button" disabled={cancelBusy} onClick={confirmCancellation}
                  style={{ border: 'none', borderRadius: '8px', padding: '9px 14px', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: cancelBusy ? 'wait' : 'pointer' }}>
                  {cancelBusy ? 'Processing…' : cancelDialog.kind === 'request' ? 'Confirm request' : 'Confirm cancellation'}
                </button>
              </div>
            </section>
          </div>
        )}

        {selectedReservation && (() => {
          const s = selectedReservation;
          const sb = statusBadge(s.status);
          const money = v => (v === undefined || v === null || v === '' ? '—' : `₱${Number(v).toLocaleString()}`);
          const so = getOverstay(s, now);
          const rows = [
            ['Phone Number', s.phone || 'Not provided'],
            ['Email Address', s.email || 'Not provided'],
            ['Preferred Contact Method', s.preferredContactMethod || 'Not provided'],
            ['Room', [s.roomNumber, s.roomType].filter(Boolean).join(' · ') || '—'],
            ['Booking Type', BOOKING_OPTIONS.find(option => option.id === getBookingOptionId(s))?.label || '—'],
            ['Guests', `${Number(s.adults || 0)} adult(s), ${Number(s.children || 0)} child(ren)`],
            ['Check-in', [s.checkIn, s.checkInTime].filter(Boolean).join(' · ') || '—'],
            ['Check-out', [s.checkOut, s.checkOutTime].filter(Boolean).join(' · ') || '—'],
            ['Duration', nights(s)],
            ['Overstay', so ? `Overstayed by ${so.label}${s.overstay?.flaggedAt ? ' (flagged)' : ''}` : s.overstayMinutes ? 'Checked out late' : 'No'],
            ['Late Check-out Charges', getLateFeeTotal(s) > 0 ? money(getLateFeeTotal(s)) : 'None'],
            ['Special Requests', s.notes || 'None'],
            ['Payment Status', s.paymentStatus || '—'],
            ['Payment Method', s.paymentMethod || '—'],
            ['Total Amount', money(s.totalAmount)],
            ['Amount Paid', money(s.amountPaid)],
            ['Balance Due', money(Math.max(0, outstandingAmount(s)))],
          ];
          return (
            <div role="presentation" onClick={event => { if (event.target === event.currentTarget) setSelectedId(null); }}
              style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', padding: '18px' }}>
              <section role="dialog" aria-modal="true" aria-labelledby="reservation-details-title"
                style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '22px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', fontFamily: "'Poppins', sans-serif" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <h2 id="reservation-details-title" style={{ color: TEXT, fontSize: '18px', margin: 0 }}>{s.guestName || 'Guest'}</h2>
                    <div style={{ color: ACCENT, fontSize: '12px', marginTop: '3px' }}>Booking ID: {s.id.slice(0, 8).toUpperCase()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: sb.bg, color: sb.color, padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, textTransform: 'capitalize' }}>{s.status}</span>
                    <button type="button" aria-label="Close details" onClick={() => setSelectedId(null)}
                      style={{ border: `1px solid ${BORDER2}`, background: CARD2, color: TEXT, borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', fontSize: '16px' }}>×</button>
                  </div>
                </div>
                <div style={{ background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: MUTED, marginBottom: '10px' }}>Status — click a step to change it</div>
                  {renderStepper(s, false)}
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px 18px', margin: 0 }}>
                  {rows.map(([label, value]) => (
                    <div key={label} style={{ gridColumn: label === 'Special Requests' ? '1 / -1' : undefined }}>
                      <dt style={{ color: MUTED, fontSize: '11px' }}>{label}</dt>
                      <dd style={{ color: label === 'Overstay' && so ? '#dc2626' : TEXT, fontSize: '13px', margin: '2px 0 0', textTransform: label === 'Payment Status' ? 'capitalize' : 'none', wordBreak: 'break-word' }}>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                  {canEditBooking(s) && (
                    <button type="button" onClick={() => setEditTarget(s)}
                      style={{ border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '9px 16px', background: CARD2, color: TEXT, fontWeight: 600, cursor: 'pointer' }}>Edit booking</button>
                  )}
                  <button type="button" onClick={() => setSelectedId(null)}
                    style={{ border: 'none', borderRadius: '8px', padding: '9px 16px', background: ACCENT, color: ACCENT_TEXT, fontWeight: 700, cursor: 'pointer' }}>Close</button>
                </div>
              </section>
            </div>
          );
        })()}

        {/* Two columns: what needs attention on the left (overstays, late
            arrivals, requests), search and filters on the right. */}
        <div style={{ fontWeight: '700', fontSize: '18px', color: TEXT, marginBottom: '12px' }}>Reservation List</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px', marginBottom: '20px', alignItems: 'start' }}>
          {/* Notifications: one compact line per type with its count; click a
              line to open the details and actions. Empty types are hidden. */}
          <section aria-label="Notifications" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '12px 14px', display: 'grid', gap: '8px', alignContent: 'start', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: TEXT }}>Notifications</div>
            {lateArrivals.length + overstayed.length + (isAdmin ? pendingCancellations.length : 0) + pendingRefunds.length + pendingModifications.length === 0 && (
              <div style={{ fontSize: '12px', color: MUTED }}>All clear — nothing needs action right now.</div>
            )}

            {lateArrivals.length > 0 && (
              <NotificationGroup title="Late arrivals" detail="Confirmed guests past their check-in time" count={lateArrivals.length} color="#d97706" t={{ CARD2, BORDER, BORDER2, TEXT, MUTED }}>
                {lateArrivals.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: '12px', color: TEXT }}>
                      <strong>{r.guestName || 'Guest'}</strong> — Room {r.roomNumber || '—'}
                      <div style={{ fontSize: '10px', color: MUTED }}>Expected {formatDate(r.checkIn)} {r.checkInTime || ''}{r.phone ? ` · ${r.phone}` : ''}</div>
                    </div>
                    <button onClick={() => setSelectedId(r.id)}
                      style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>View</button>
                  </div>
                ))}
              </NotificationGroup>
            )}

            {overstayed.length > 0 && (
              <NotificationGroup title="Overstayed guests" detail="Still checked in after check-out time" count={overstayed.length} color="#dc2626" t={{ CARD2, BORDER, BORDER2, TEXT, MUTED }}>
                {quickView !== 'overstayed' && (
                  <button onClick={() => { setQuickView('overstayed'); setFilter('checked-in'); }}
                    style={{ ...inp, justifySelf: 'start', padding: '5px 10px', fontSize: '11px' }}>Show them in the list</button>
                )}
                {overstayed.map(({ r, info }) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid rgba(220,38,38,0.25)' }}>
                    <div style={{ fontSize: '12px', color: TEXT }}>
                      <strong>{r.guestName}</strong> — Room {r.roomNumber}
                      <div style={{ fontSize: '10px', color: MUTED }}>
                        Overstayed {info.label} · was due {formatDate(r.checkOut)} {r.checkOutTime || DEFAULT_CHECKOUT_TIME}
                        {r.phone ? ` · ${r.phone}` : ''}
                        {getLateFeeTotal(r) > 0 ? ` · Late fees ₱${getLateFeeTotal(r).toLocaleString()}` : ''}
                        {hasOutstandingBalance(r) ? ` · Owes ₱${outstandingAmount(r).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={() => setSelectedId(r.id)}
                        style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>View</button>
                      {r.overstay?.flaggedAt ? (
                        <span style={{ alignSelf: 'center', fontSize: '10px', fontWeight: 700, color: dark ? '#fca5a5' : '#b91c1c' }}>Flagged</span>
                      ) : (
                        <button onClick={() => flagOverstay(r)} disabled={statusBusyId === r.id}
                          style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Flag overstay</button>
                      )}
                      <button onClick={() => setLateFeeDialog({ reservation: r, amount: '', note: `Overstayed ${info.label}` })}
                        style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Add late fee</button>
                      <button onClick={() => updateStatus(r.id, 'checked-out')} disabled={statusBusyId === r.id}
                        title={hasOutstandingBalance(r) ? 'Collect the balance before checking out' : undefined}
                        style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: statusBusyId === r.id ? 0.6 : 1 }}>Check out</button>
                    </div>
                  </div>
                ))}
              </NotificationGroup>
            )}

            {isAdmin && pendingCancellations.length > 0 && (
              <NotificationGroup title="Cancellation requests" detail="Sent by receptionists for approval" count={pendingCancellations.length} color="#d97706" t={{ CARD2, BORDER, BORDER2, TEXT, MUTED }}>
                {pendingCancellations.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${ROWLINE}` }}>
                    <div style={{ fontSize: '12px', color: TEXT }}>
                      <strong>{r.guestName}</strong> — Room {r.roomNumber}
                      <div style={{ fontSize: '10px', color: MUTED }}>Reason: {r.cancellationReason || 'No reason given'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => openCancellationDialog('approve', r)}
                        style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                        Approve
                      </button>
                      <button onClick={() => denyCancellation(r.id)}
                        style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </NotificationGroup>
            )}

            {pendingRefunds.length > 0 && (
              <NotificationGroup title="Refund requests" detail="Guests asking for a refund" count={pendingRefunds.length} color="#d97706" t={{ CARD2, BORDER, BORDER2, TEXT, MUTED }}>
                {pendingRefunds.map(r => (
                  <article key={`refund-${r.id}`} style={{ background: CARD, borderRadius: '14px', border: `1px solid ${BORDER}`, padding: '16px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: TEXT }}>Refund request · {r.guestName || 'Guest'} · #{r.id.slice(0, 8).toUpperCase()}</div>
                    <p style={{ margin: '8px 0', color: MUTED, fontSize: '12px' }}>
                      {r.refundDecision?.reason || 'Staff review requested'} · Proposed refund ₱{Number(r.refundDecision?.refundableAmount || 0).toLocaleString()}
                    </p>
                    {r.refundDecision?.alternatives?.length > 0 && (
                      <p style={{ margin: '4px 0 10px', color: MUTED, fontSize: '11px' }}>Options: {r.refundDecision.alternatives.join(' ')}</p>
                    )}
                    {r.refundRequestStatus === 'needs_review' && (
                      <label style={{ display: 'inline-grid', gap: 4, margin: '0 10px 10px 0', color: MUTED, fontSize: 11 }}>
                        Staff-verified refund amount (₱)
                        <input type="number" min="0.01" step="0.01" value={manualRefunds[r.id] || ''}
                          onChange={event => setManualRefunds(current => ({ ...current, [r.id]: event.target.value }))}
                          style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 7, padding: '8px' }} />
                      </label>
                    )}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button disabled={decisionBusy === r.id || (r.refundRequestStatus === 'needs_review' && !manualRefunds[r.id])}
                        onClick={() => decideRequest('approve-refund', r, r.refundRequestStatus === 'needs_review' ? { amount: manualRefunds[r.id] } : {})}
                        style={{ background: '#166534', color: '#fff', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Approve &amp; refund</button>
                      <button disabled={decisionBusy === r.id} onClick={() => decideRequest('reject-refund', r)}
                        style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Reject</button>
                      <button disabled={decisionBusy === r.id} onClick={() => decideRequest('review-refund', r)}
                        style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Keep for manual review</button>
                    </div>
                  </article>
                ))}
              </NotificationGroup>
            )}

            {pendingModifications.length > 0 && (
              <NotificationGroup title="Booking change requests" detail="Guests asking to change their booking" count={pendingModifications.length} color="#2563eb" t={{ CARD2, BORDER, BORDER2, TEXT, MUTED }}>
                {pendingModifications.map(r => {
                  const request = r.modificationRequest;
                  const requiresManualPrice = request.outcome === 'needs_review';
                  return (
                    <article key={`modification-${r.id}`} style={{ background: CARD, borderRadius: '14px', border: `1px solid ${BORDER}`, padding: '16px' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: TEXT }}>Schedule change · {r.guestName || 'Guest'} · #{r.id.slice(0, 8).toUpperCase()}</div>
                      <p style={{ margin: '8px 0', color: MUTED, fontSize: '12px' }}>
                        {request.originalCheckIn} – {request.originalCheckOut} → {request.requestedCheckIn} – {request.requestedCheckOut}
                      </p>
                      <p style={{ margin: '4px 0 10px', color: MUTED, fontSize: '12px' }}>{request.reason}</p>
                      {requiresManualPrice && (
                        <label style={{ display: 'inline-grid', gap: 4, margin: '0 10px 10px 0', color: MUTED, fontSize: 11 }}>
                          Staff-verified updated total (₱)
                          <input type="number" min="1" step="0.01" value={manualTotals[r.id] || ''}
                            onChange={event => setManualTotals(current => ({ ...current, [r.id]: event.target.value }))}
                            style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 7, padding: '8px' }} />
                        </label>
                      )}
                      {request.paymentDue > 0 && <p style={{ color: MUTED, fontSize: 11 }}>50% deposit due on extension: ₱{Number(request.paymentDue).toLocaleString()}</p>}
                      {request.refundDue > 0 && <p style={{ color: MUTED, fontSize: 11 }}>Calculated refund after reduction: ₱{Number(request.refundDue).toLocaleString()}</p>}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button disabled={decisionBusy === r.id} onClick={() => decideRequest(
                          'approve-modification', r,
                          requiresManualPrice ? { updatedTotal: manualTotals[r.id] } : {},
                        )} style={{ background: '#166534', color: '#fff', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Approve</button>
                        <button disabled={decisionBusy === r.id} onClick={() => decideRequest('reject-modification', r)}
                          style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>Reject</button>
                      </div>
                    </article>
                  );
                })}
              </NotificationGroup>
            )}
          </section>

          <section aria-label="Find bookings" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px', display: 'grid', gap: '10px', alignContent: 'start', position: 'sticky', top: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: TEXT }}>Find bookings</div>
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: '10px', padding: '8px 14px' }}>
              <i className="ti ti-search" style={{ fontSize: '14px', color: MUTED }} />
              <input value={search} onChange={e => setSearch(e.target.value)} type="search"
                placeholder="Search guest, room, phone, status or #ref"
                aria-label="Search reservations"
                style={{ border: 'none', outline: 'none', fontSize: '12px', fontFamily: "'Poppins', sans-serif", width: '100%', background: 'transparent', color: TEXT }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Filter */}
              <select value={filter} onChange={e => setFilter(e.target.value)} style={inp} aria-label="Filter by status">
                <option value="all">All status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked-in">Checked-in</option>
                <option value="checked-out">Checked-out</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <SortControls sortBy={sortBy} sortDir={sortDir}
                onSortBy={v => setSortBy(v)}
                onSortDir={v => setSortDir(v)} style={inp} />
              {quickView && (
                <button onClick={clearQuickView} title="Clear card filter"
                  style={{ ...inp, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                  {QUICK_VIEWS[quickView].label} <i className="ti ti-x" style={{ fontSize: '12px' }} />
                </button>
              )}
              {/* Add booking */}
              <button onClick={() => navigate(isReceptionist ? '/receptionist/walkin' : '/admin/walkin')}
                style={{ background: ACCENT, border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: ACCENT_TEXT }}>
                + Add Booking
              </button>
            </div>
          </section>
        </div>

        {/* List / Day / Week / Month board */}
        <ReservationBoard
          reservations={filtered}
          t={{ dark, CARD, CARD2, BORDER, BORDER2, TEXT, MUTED, ACCENT, ACCENT_TEXT }}
          formatDate={formatDate}
          now={now}
          getOverstay={getOverstay}
          isDelayedArrival={isDelayedArrival}
          hasOutstandingBalance={hasOutstandingBalance}
          nights={nights}
          onSelect={setSelectedId}
          renderActions={renderActions}
        />
      </div>
    </PageLayout>
  );
}