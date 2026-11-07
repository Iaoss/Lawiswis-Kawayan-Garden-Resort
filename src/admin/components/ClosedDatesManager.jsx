import React, { useEffect, useState } from 'react';
import { auth } from '../../firebase/firebase';
import { formatClosedRange, getClosedDatesError } from '../../lib/closedDates';

// Settings → Resort availability → Closed dates. The resort is closed on
// these days (maintenance, private event); guests can still book other dates
// and see a notice on the website.
export default function ClosedDatesManager({ t }) {
  const [list, setList] = useState([]);
  const [draft, setDraft] = useState({ from: '', to: '', reason: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    let active = true;
    fetch('/api/resort-availability')
      .then(response => response.json())
      .then(data => { if (active) setList(Array.isArray(data.closedDates) ? data.closedDates : []); })
      .catch(() => { if (active) setMessage({ type: 'error', text: 'Could not load the closed dates.' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const save = async next => {
    const user = auth.currentUser;
    if (!user) { setMessage({ type: 'error', text: 'Please sign in again.' }); return false; }
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await fetch('/api/resort-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ closedDates: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the closed dates.');
      setList(data.closedDates || []);
      const n = data.notices || {};
      const parts = ['Closed dates saved. The website shows them now.'];
      if (n.notified) parts.push(`Emailed ${n.notified} affected guest${n.notified === 1 ? '' : 's'} their options: new dates or a full refund.`);
      if (n.noEmail) parts.push(`${n.noEmail} booking${n.noEmail === 1 ? ' has' : 's have'} no email: call them (see Cancellation policy → Resort closure).`);
      if (n.failed) parts.push('Some emails could not be sent: resend them from Cancellation policy → Resort closure.');
      setMessage({ type: n.failed ? 'error' : 'ok', text: parts.join(' ') });
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async event => {
    event.preventDefault();
    const item = { id: `closed_${Date.now().toString(36)}`, from: draft.from, to: draft.to || draft.from, reason: draft.reason.trim() };
    const error = getClosedDatesError([item]);
    if (error) { setMessage({ type: 'error', text: error }); return; }
    if (await save([...list, item])) setDraft({ from: '', to: '', reason: '' });
  };

  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const input = { border: `1px solid ${t.BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', background: t.CARD2, color: t.TEXT };

  return (
    <div style={{ borderTop: `1px solid ${t.BORDER}`, padding: '16px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.TEXT }}>Closed dates</div>
      <div style={{ fontSize: 12, color: t.SUBTEXT, margin: '3px 0 12px', lineHeight: 1.6 }}>
        For maintenance, a typhoon or a private event. The resort is closed on these days (both dates included) and they can’t be booked. Guests already booked on them are emailed right away: they can pick new dates (same booking, no fee) or cancel for a full refund.
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: t.MUTED }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 12, color: t.MUTED, marginBottom: 10 }}>No closed dates planned.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {list.map(item => (
            <div key={item.id || item.from} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: t.CARD2, border: `1px solid ${t.BORDER}` }}>
              <i className="ti ti-calendar-off" style={{ color: '#d97706' }} />
              <div style={{ flex: 1, fontSize: 12, color: t.TEXT }}>
                <strong>{formatClosedRange(item)}</strong>{item.reason ? <span style={{ color: t.SUBTEXT }}> · {item.reason}</span> : null}
              </div>
              <button type="button" disabled={saving} onClick={() => save(list.filter(other => other !== item))}
                style={{ background: 'transparent', border: `1px solid ${t.BORDER}`, color: '#dc2626', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: t.SUBTEXT }}>
          From
          <input type="date" required min={today} value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value, to: d.to && d.to < e.target.value ? e.target.value : d.to }))} style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: t.SUBTEXT }}>
          To
          <input type="date" min={draft.from || today} value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: t.SUBTEXT, flex: '1 1 180px' }}>
          Reason (shown to guests)
          <input maxLength={120} value={draft.reason} placeholder="e.g. Pool maintenance" onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))} style={input} />
        </label>
        <button type="submit" disabled={saving}
          style={{ padding: '9px 16px', border: 0, borderRadius: 9, background: t.ACCENT, color: t.ACCENT_TEXT, fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Saving…' : 'Add closed dates'}
        </button>
      </form>
      {message.text && (
        <div role={message.type === 'error' ? 'alert' : 'status'} style={{ fontSize: 12, marginTop: 8, color: message.type === 'error' ? '#b91c1c' : '#15803d' }}>{message.text}</div>
      )}
    </div>
  );
}
