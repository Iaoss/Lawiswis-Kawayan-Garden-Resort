import React, { useEffect, useRef, useState } from 'react';
import { getClockState, onClockChange, serverNow, syncServerClock } from '../../lib/serverClock';

const POS_KEY = 'lkgr_clock_pos';
const MIN_KEY = 'lkgr_clock_min';
const read = (key, fallback) => { try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save = (key, value) => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } };

const dateFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

// How far off the device clock is, in words.
function describeOffset(ms) {
  const minutes = Math.round(Math.abs(ms) / 60000);
  const label = minutes >= 1440 ? `${Math.round(minutes / 1440)} day(s)` : minutes >= 60 ? `${Math.round(minutes / 60)} hour(s)` : `${minutes} minute(s)`;
  return `${label} ${ms > 0 ? 'behind' : 'ahead'}`;
}

// A small floating clock with the correct Philippine date and time from the
// server. It can be dragged anywhere and shrunk to just the time. If this
// computer's clock is wrong, it says so (the system still uses the right time).
export default function FloatingClock({ dark = false }) {
  const [, setTick] = useState(0);
  const [clock, setClock] = useState(getClockState);
  const [pos, setPos] = useState(() => read(POS_KEY, null));
  const [small, setSmall] = useState(() => read(MIN_KEY, false));
  const drag = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    syncServerClock({ force: true });
    const off = onClockChange(() => setClock(getClockState()));
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    const resync = setInterval(() => syncServerClock({ force: true }), 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') syncServerClock({ force: true }); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { off(); clearInterval(timer); clearInterval(resync); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const onPointerDown = event => {
    if (event.target.closest('button')) return;
    const rect = box.current.getBoundingClientRect();
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = event => {
    if (!drag.current) return;
    const rect = box.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, event.clientX - drag.current.dx), window.innerWidth - rect.width);
    const y = Math.min(Math.max(0, event.clientY - drag.current.dy), window.innerHeight - rect.height);
    drag.current.moved = true;
    setPos({ x, y });
  };
  const onPointerUp = () => {
    if (drag.current?.moved && pos) save(POS_KEY, pos);
    drag.current = null;
  };

  const toggleSmall = () => { setSmall(v => { save(MIN_KEY, !v); return !v; }); };

  const now = new Date(serverNow());
  const wrong = clock.synced && Math.abs(clock.offsetMs) >= 2 * 60 * 1000;
  const bg = wrong ? (dark ? '#3b1515' : '#fef2f2') : (dark ? '#141c14' : '#ffffff');
  const border = wrong ? '#dc2626' : (dark ? '#2f3b2f' : '#d6dccf');
  const text = dark ? '#f3f4f6' : '#1f2937';
  const muted = dark ? '#9ca3af' : '#6b7280';
  const place = pos
    ? { left: Math.min(pos.x, window.innerWidth - 60), top: Math.min(pos.y, window.innerHeight - 40) }
    : { left: '50%', bottom: 16, transform: 'translateX(-50%)' };

  return (
    <div ref={box} role="timer" aria-label="System date and time (Philippine time)"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      title="System time (Philippines). Drag to move."
      style={{ position: 'fixed', ...place, zIndex: 440, background: bg, color: text, border: `1px solid ${border}`, borderRadius: 12,
        boxShadow: '0 6px 20px rgba(0,0,0,.18)', padding: small ? '6px 10px' : '8px 12px', fontFamily: "'Poppins', sans-serif",
        cursor: 'grab', userSelect: 'none', touchAction: 'none', maxWidth: 'calc(100vw - 32px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="ti ti-clock" aria-hidden="true" style={{ color: wrong ? '#dc2626' : '#16a34a' }} />
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{timeFmt.format(now)}</div>
          {!small && <div style={{ fontSize: 11, color: muted }}>{dateFmt.format(now)} · PH time{clock.synced ? '' : ' (checking…)'}</div>}
        </div>
        <button type="button" onClick={toggleSmall} aria-label={small ? 'Show the date' : 'Show the time only'}
          style={{ border: 0, background: 'none', color: muted, cursor: 'pointer', padding: 2, marginLeft: 2, fontSize: 14 }}>
          <i className={`ti ${small ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true" />
        </button>
      </div>
      {wrong && !small && (
        <div role="alert" style={{ fontSize: 11, color: '#dc2626', marginTop: 4, maxWidth: 240, lineHeight: 1.4 }}>
          This computer's clock is {describeOffset(clock.offsetMs)}. The system uses the correct time shown here.
        </div>
      )}
    </div>
  );
}
