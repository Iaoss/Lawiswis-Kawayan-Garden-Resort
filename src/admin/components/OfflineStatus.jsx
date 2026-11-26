import React, { useEffect, useState } from 'react';
import { dismissItem, flushOutbox, getOutbox, retryItem, subscribeOutbox } from '../lib/offlineOutbox';
import { sendStaffRequest } from '../lib/staffApi';
import { auth } from '../../firebase/firebase';

// Connection banner for the staff portal.
//   Offline: shows that the lists are the copy saved on this computer (and
//   when it was last updated), and that new changes will be sent later.
//   Changes waiting: how many, and what they are.
//   Back online: sends the waiting changes in order and says how it went.
const LAST_ONLINE_KEY = 'lkgr_last_online';
const readLastOnline = () => {
  try { return Number(window.localStorage.getItem(LAST_ONLINE_KEY)) || 0; } catch { return 0; }
};
const markOnline = () => {
  try { window.localStorage.setItem(LAST_ONLINE_KEY, String(Date.now())); } catch { /* ignore */ }
};
const timeLabel = ms => (ms
  ? new Date(ms).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
  : 'unknown');

export default function OfflineStatus({ dark = false }) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [items, setItems] = useState(getOutbox);
  const [lastOnline, setLastOnline] = useState(readLastOnline);
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retryingId, setRetryingId] = useState('');

  useEffect(() => subscribeOutbox(setItems), []);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      if (navigator.onLine === false || !getOutbox().some(item => item.status === 'pending')) return;
      setSyncing(true);
      try {
        const { sent, failed } = await flushOutbox(sendStaffRequest, { uid: auth.currentUser?.uid || '' });
        if (!active) return;
        if (sent || failed) {
          setNotice(`Back online: ${sent} change${sent === 1 ? '' : 's'} saved${failed ? `, ${failed} need${failed === 1 ? 's' : ''} attention` : ''}.`);
          setTimeout(() => { if (active) setNotice(''); }, 10000);
        }
      } finally {
        if (active) setSyncing(false);
      }
    };
    const goOnline = () => { setOnline(true); markOnline(); setLastOnline(Date.now()); sync(); };
    const goOffline = () => { setOnline(false); setLastOnline(readLastOnline()); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine !== false) { markOnline(); sync(); }
    const timer = setInterval(() => { if (navigator.onLine !== false) { markOnline(); sync(); } }, 30000);
    return () => {
      active = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(timer);
    };
  }, []);

  // Each staff member sees and sends only their own saved changes.
  const uid = auth.currentUser?.uid;
  const mine = items.filter(item => !item.uid || !uid || item.uid === uid);
  const pending = mine.filter(item => item.status === 'pending');
  const failed = mine.filter(item => item.status === 'failed');
  if (online && !pending.length && !failed.length && !notice) return null;

  const retryFailed = async item => {
    if (!online || retryingId) return;
    setRetryingId(item.id);
    retryItem(item.id);
    try {
      const { sent, failed: stillFailed } = await flushOutbox(sendStaffRequest, { uid: auth.currentUser?.uid || '' });
      if (sent) setNotice('The room update was saved.');
      else if (stillFailed) setNotice('The update was rejected again. Check the room status and error before retrying.');
    } catch (error) {
      console.error('Could not retry the saved room update:', error);
      setNotice(error.message || 'The room update could not be retried.');
    } finally {
      setRetryingId('');
    }
  };

  const bar = (bg, color, border) => ({ background: bg, color, border: `1px solid ${border}`, borderRadius: 12, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.55, marginBottom: 12 });
  const amber = dark ? bar('rgba(251,191,36,0.12)', '#fcd34d', 'rgba(251,191,36,0.35)') : bar('#fffbeb', '#92400e', '#fde68a');
  const red = dark ? bar('rgba(248,113,113,0.12)', '#fca5a5', 'rgba(248,113,113,0.35)') : bar('#fef2f2', '#991b1b', '#fecaca');
  const green = dark ? bar('rgba(134,239,172,0.12)', '#86efac', 'rgba(134,239,172,0.35)') : bar('#f0fdf4', '#166534', '#bbf7d0');
  const linkBtn = { border: 0, background: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontWeight: 700 };

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div style={amber}>
          <strong><i className="ti ti-wifi-off" aria-hidden="true" /> No internet connection.</strong>{' '}
          You are seeing the bookings and payments saved on this computer (last updated {timeLabel(lastOnline)}).
          Payments, room updates, maintenance reports, charges, check-ins, check-outs and walk-ins are kept and sent automatically when the internet is back.
          Online payments, emails and discounts need the internet.
        </div>
      )}
      {pending.length > 0 && (
        <div style={amber}>
          <strong><i className="ti ti-cloud-upload" aria-hidden="true" /> {pending.length} change{pending.length === 1 ? '' : 's'} waiting to be sent</strong>
          {online ? (syncing ? ' · sending now…' : ' · sending shortly') : ' · will be sent when the internet is back'}
          {' · '}<button type="button" onClick={() => setOpen(value => !value)} style={linkBtn}>{open ? 'Hide' : 'Show'}</button>
          {open && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {pending.map(item => (
                <li key={item.id}>
                  {item.label} · {timeLabel(Date.parse(item.createdAt))}
                  {item.error && <> · {item.error}</>}
                  {item.path === 'housekeeping' && item.error && (
                    <> · <button type="button" disabled={!online || Boolean(retryingId)} onClick={() => retryFailed(item)} style={linkBtn}>
                      {retryingId === item.id ? 'Retrying…' : online ? 'Retry sync' : 'Reconnect to retry'}
                    </button></>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {failed.map(item => (
        <div key={item.id} style={red}>
          <strong><i className="ti ti-alert-triangle" aria-hidden="true" /> Not saved: {item.label}</strong> (made {timeLabel(Date.parse(item.createdAt))} while offline).{' '}
          {item.error}{' '}
          {item.path === 'housekeeping'
            ? Number(item.errorStatus) === 409 || /only an available room can be sent for cleaning/i.test(item.error || '')
              ? 'The server rejected this request because the room state changed. Check its current status and create a fresh request only if it still needs cleaning. '
              : <>
                The server did not save this room update.{' '}
                <button type="button" disabled={!online || Boolean(retryingId)} onClick={() => retryFailed(item)} style={linkBtn}>
                  {retryingId === item.id ? 'Retrying…' : online ? 'Retry sync' : 'Reconnect to retry'}
                </button>{' '}
              </>
            : 'Please enter it again. '}
          <button type="button" onClick={() => dismissItem(item.id)} style={linkBtn}>Dismiss</button>
        </div>
      ))}
      {notice && <div style={green}><i className="ti ti-cloud-check" aria-hidden="true" /> {notice}</div>}
    </div>
  );
}
