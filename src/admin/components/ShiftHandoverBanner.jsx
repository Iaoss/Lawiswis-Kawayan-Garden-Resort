import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';

// The last shift's handover (saved by the End of shift summary), shown on
// the dashboards so the next person at the desk sees the note. Hidden after
// 24 hours, for the person who wrote it, or once dismissed on this device.

export const HANDOVER_DOC = ['notifications', 'last-shift-handover'];
const DISMISSED_KEY = 'lkgr_handover_dismissed';
const SHOW_FOR_MS = 24 * 3600000;

const millis = value => (value?.toMillis ? value.toMillis() : Number(value) || 0);

export default function ShiftHandoverBanner({ dark }) {
  const [handover, setHandover] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => onSnapshot(doc(db, ...HANDOVER_DOC),
    snap => setHandover(snap.exists() ? snap.data() : null),
    () => setHandover(null)), []);

  if (!handover) return null;
  const at = millis(handover.createdAt) || millis(handover.createdAtMs);
  const key = String(at);
  if (!at || Date.now() - at > SHOW_FOR_MS) return null;
  if (handover.staffUid && handover.staffUid === auth.currentUser?.uid) return null;
  if (dismissed === key) return null;

  const dismiss = () => {
    setDismissed(key);
    try { localStorage.setItem(DISMISSED_KEY, key); } catch { /* storage unavailable */ }
  };
  const when = new Date(at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  const c = dark
    ? { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.4)', text: '#f5f5f0', muted: '#c7c7bd' }
    : { bg: '#fffbeb', border: '#fcd34d', text: '#1f2937', muted: '#6b7280' };

  return (
    <section role="note" aria-label="Note from the last shift"
      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, color: c.text }}>
      <i className="ti ti-clipboard-text" aria-hidden="true" style={{ fontSize: 20, color: '#d97706', marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.55 }}>
        <div style={{ fontWeight: 700 }}>Note from {handover.staffName || 'the last shift'} · {when}</div>
        {handover.note
          ? <div style={{ marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{handover.note}</div>
          : <div style={{ marginTop: 2, color: c.muted }}>No note left.</div>}
        {handover.summary && <div style={{ marginTop: 4, fontSize: 11.5, color: c.muted }}>{handover.summary}</div>}
      </div>
      <button type="button" onClick={dismiss} aria-label="Hide this note"
        style={{ border: 0, background: 'none', color: c.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
    </section>
  );
}
