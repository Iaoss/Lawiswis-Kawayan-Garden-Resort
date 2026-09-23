import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { auth, db } from '../../firebase/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import PageLayout from '../components/PageLayout';

const ACCENT = '#9cb56f';
const DARK   = '#1A312C';
const MUTED  = '#9ca3af';
const FONT   = "'Poppins', sans-serif";
const SYNC_EVERY_MS = 60000;

const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: 'ti-inbox' },
  { key: 'sent',  label: 'Sent',  icon: 'ti-send' },
];

const EMPTY_COMPOSE = { open: false, to: '', cc: '', subject: '', body: '', inReplyTo: '', references: [] };

// ── helpers ────────────────────────────────────────────────
const toDate = (ts) => (ts?.seconds ? new Date(ts.seconds * 1000) : null);

function shortDate(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const fullDate = (ts) => toDate(ts)?.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) || '';

const senderLabel = (m) => m.fromName || m.from || 'Unknown';

const quote = (m) =>
  `\n\n\nOn ${fullDate(m.date)}, ${senderLabel(m)} <${m.from}> wrote:\n` +
  (m.text || '').split('\n').map((l) => `> ${l}`).join('\n');

// Renders untrusted email HTML in a sandbox: no scripts run, links open in a new tab.
const wrapHtml = (html) =>
  `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
   <style>body{font-family:Arial,sans-serif;font-size:14px;color:#1f2937;margin:0;padding:4px;word-wrap:break-word}img{max-width:100%;height:auto}</style>
   </head><body>${html}</body></html>`;

async function callApi(path, body) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const inp = {
  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '9px 12px', fontSize: '12px', fontFamily: FONT, color: '#111',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

// ── page ───────────────────────────────────────────────────
export default function Email() {
  const [authReady, setAuthReady] = useState(false);
  const [emails, setEmails]       = useState([]);
  const [folder, setFolder]       = useState('inbox');
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch]       = useState('');
  const [syncing, setSyncing]     = useState(false);
  const [notice, setNotice]       = useState(null); // { type: 'error' | 'ok', text }
  const [compose, setCompose]     = useState(EMPTY_COMPOSE);
  const [sending, setSending]     = useState(false);

  // Wait until Firebase knows who is logged in (needed for the API token).
  useEffect(() => onAuthStateChanged(auth, (u) => setAuthReady(!!u)), []);

  // Live list from Firestore (newest first). Filtered by folder on the client,
  // so no composite index is required.
  useEffect(() => {
    if (!authReady) return;
    const q = query(collection(db, 'emails'), orderBy('date', 'desc'), limit(300));
    return onSnapshot(
      q,
      (snap) => setEmails(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setNotice({ type: 'error', text: 'Cannot read emails. Check your Firestore rules for the emails collection.' })
    );
  }, [authReady]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await callApi('/api/email-sync');
      setNotice((n) => (n?.type === 'error' ? null : n));
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setSyncing(false);
    }
  }, []);

  // Sync on load, then every minute while this tab is visible.
  useEffect(() => {
    if (!authReady) return;
    sync();
    const t = setInterval(() => { if (!document.hidden) sync(); }, SYNC_EVERY_MS);
    return () => clearInterval(t);
  }, [authReady, sync]);

  const unreadCount = useMemo(
    () => emails.filter((e) => e.folder === 'inbox' && !e.read).length,
    [emails]
  );

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return emails.filter((e) => {
      if (e.folder !== folder) return false;
      if (!s) return true;
      return [e.subject, e.from, e.fromName, e.snippet, (e.to || []).join(' ')]
        .some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [emails, folder, search]);

  const selected = emails.find((e) => e.id === selectedId) || null;

  const openEmail = async (m) => {
    setSelectedId(m.id);
    if (!m.read) {
      try { await updateDoc(doc(db, 'emails', m.id), { read: true }); } catch {}
    }
  };

  const openCompose = (preset = {}) => setCompose({ ...EMPTY_COMPOSE, open: true, ...preset });

  const reply = (m) => openCompose({
    to: folder === 'sent' ? (m.to || []).join(', ') : m.from,
    subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
    body: quote(m),
    inReplyTo: m.messageId || '',
    references: [...(m.references || []), ...(m.messageId ? [m.messageId] : [])],
  });

  const forward = (m) => openCompose({
    subject: /^fwd:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
    body: `\n\n---------- Forwarded message ----------\nFrom: ${senderLabel(m)} <${m.from}>\nDate: ${fullDate(m.date)}\nSubject: ${m.subject}\n\n${m.text || ''}`,
  });

  const send = async () => {
    setSending(true);
    try {
      await callApi('/api/email-send', {
        to: compose.to, cc: compose.cc, subject: compose.subject, text: compose.body,
        inReplyTo: compose.inReplyTo || undefined, references: compose.references,
      });
      setCompose(EMPTY_COMPOSE);
      setNotice({ type: 'ok', text: 'Email sent.' });
      sync(); // pulls the new message into the Sent folder
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <PageLayout>
      <div style={{ display: 'grid', gridTemplateColumns: '190px 340px 1fr', gap: '16px', height: 'calc(100vh - 120px)', fontFamily: FONT }}>

        {/* ── Folders ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button onClick={() => openCompose()}
            style={{ background: DARK, color: ACCENT, border: 'none', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}>
            <i className="ti ti-pencil" style={{ fontSize: '14px' }} /> Compose
          </button>

          {FOLDERS.map((f) => {
            const active = folder === f.key;
            return (
              <button key={f.key} onClick={() => { setFolder(f.key); setSelectedId(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: '12.5px', textAlign: 'left', background: active ? ACCENT : 'transparent', color: active ? '#0a1a0a' : '#6b7280', fontWeight: active ? '600' : '400' }}>
                <i className={`ti ${f.icon}`} style={{ fontSize: '16px' }} />
                <span style={{ flex: 1 }}>{f.label}</span>
                {f.key === 'inbox' && unreadCount > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', fontSize: '10px', fontWeight: '700', padding: '1px 7px' }}>{unreadCount}</span>
                )}
              </button>
            );
          })}

          <div style={{ flex: 1 }} />
          <button onClick={sync} disabled={syncing}
            style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', fontSize: '11.5px', color: '#6b7280', cursor: syncing ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <i className="ti ti-refresh" style={{ fontSize: '14px' }} />
            {syncing ? 'Checking Gmail…' : 'Refresh'}
          </button>
        </div>

        {/* ── Message list ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#111', marginBottom: '10px' }}>
              {FOLDERS.find((f) => f.key === folder).label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f9fafb', borderRadius: '10px', padding: '8px 12px', border: '1px solid #e5e7eb' }}>
              <i className="ti ti-search" style={{ fontSize: '14px', color: MUTED }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search emails..."
                style={{ border: 'none', outline: 'none', fontSize: '12px', background: 'transparent', fontFamily: FONT, width: '100%', color: '#111' }} />
            </div>
          </div>

          {notice && (
            <div onClick={() => setNotice(null)}
              style={{ margin: '10px 14px 0', padding: '8px 12px', borderRadius: '8px', fontSize: '11.5px', cursor: 'pointer', background: notice.type === 'error' ? '#fef2f2' : '#f0fdf4', color: notice.type === 'error' ? '#b91c1c' : '#428475', border: `1px solid ${notice.type === 'error' ? '#fecaca' : '#86efac'}` }}>
              {notice.text}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visible.length === 0 ? (
              <div style={{ textAlign: 'center', color: MUTED, fontSize: '12px', padding: '30px' }}>
                {syncing ? 'Checking Gmail…' : search ? 'No emails match your search.' : 'No emails here yet.'}
              </div>
            ) : visible.map((m) => {
              const active = selectedId === m.id;
              const who = folder === 'sent' ? `To: ${(m.to || []).join(', ')}` : senderLabel(m);
              return (
                <div key={m.id} onClick={() => openEmail(m)}
                  style={{ padding: '12px 14px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: active ? '#f0fdf4' : 'transparent', borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#111', fontWeight: m.read ? '500' : '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
                    <span style={{ fontSize: '10px', color: MUTED, flexShrink: 0 }}>{shortDate(m.date)}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#111', fontWeight: m.read ? '400' : '600', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {!m.read && <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444', marginRight: '6px' }} />}
                    {m.subject}
                  </div>
                  <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.snippet}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Reading pane ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
              <div style={{ fontSize: '48px', marginBottom: '14px' }}>✉️</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Select an email</div>
              <div style={{ fontSize: '12px' }}>Pick a message from the list to read it</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: '#111', marginBottom: '10px' }}>{selected.subject}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
                    {senderLabel(selected)[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#111' }}>
                      {senderLabel(selected)} <span style={{ color: MUTED, fontWeight: '400' }}>&lt;{selected.from}&gt;</span>
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      To: {(selected.to || []).join(', ')} · {fullDate(selected.date)}
                    </div>
                  </div>
                  <button onClick={() => reply(selected)}
                    style={{ padding: '7px 14px', background: DARK, color: ACCENT, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-arrow-back-up" style={{ fontSize: '14px' }} /> Reply
                  </button>
                  <button onClick={() => forward(selected)}
                    style={{ padding: '7px 14px', background: '#f0fdf4', color: '#428475', border: '1px solid #86efac', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-arrow-forward-up" style={{ fontSize: '14px' }} /> Forward
                  </button>
                </div>
                {selected.attachments?.length > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '11px', color: '#6b7280', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {selected.attachments.map((a, i) => (
                      <span key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '2px 10px' }}>
                        <i className="ti ti-paperclip" style={{ fontSize: '11px' }} /> {a.filename}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: '#fff' }}>
                {selected.html ? (
                  <iframe title="Email body" sandbox="allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={wrapHtml(selected.html)}
                    style={{ width: '100%', height: '100%', minHeight: '300px', border: 'none' }} />
                ) : (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: FONT, fontSize: '13px', lineHeight: '1.6', color: '#111' }}>{selected.text || '(empty message)'}</pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Compose window ── */}
      {compose.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={(e) => { if (e.target === e.currentTarget && !sending) setCompose(EMPTY_COMPOSE); }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '600px', maxWidth: '100%', maxHeight: '100%', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', fontFamily: FONT }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: '#111' }}>New message</div>
              <button onClick={() => setCompose(EMPTY_COMPOSE)} disabled={sending}
                style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', color: MUTED, cursor: 'pointer', fontFamily: FONT }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input style={inp} placeholder="To (separate several with commas)" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
              <input style={inp} placeholder="Cc (optional)" value={compose.cc} onChange={(e) => setCompose({ ...compose, cc: e.target.value })} />
              <input style={inp} placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
              <textarea style={{ ...inp, resize: 'vertical', lineHeight: '1.6', fontSize: '13px' }} rows={12} placeholder="Write your message..."
                value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setCompose(EMPTY_COMPOSE)} disabled={sending}
                  style={{ padding: '9px 18px', background: '#f9fafb', color: MUTED, border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontFamily: FONT }}>Discard</button>
                <button onClick={send} disabled={sending}
                  style={{ padding: '9px 20px', background: DARK, color: ACCENT, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: sending ? 'default' : 'pointer', fontFamily: FONT, opacity: sending ? 0.7 : 1 }}>
                  {sending ? 'Sending…' : 'Send email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
