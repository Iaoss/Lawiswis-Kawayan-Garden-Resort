import React, { useEffect, useMemo, useState } from 'react';
import { arrayUnion, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { useStaffAccess } from '../lib/useStaffAccess';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

export default function ContactInquiries() {
  const { settings } = useSettings();
  const dark = Boolean(settings?.darkMode);
  const [inquiries, setInquiries] = useState([]);
  const [filter, setFilter] = useState('unanswered');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  // Reply being written: { inquiry, subject, message, sending, error }
  const [reply, setReply] = useState(null);
  const { user: me } = useStaffAccess();

  const colors = {
    page: dark ? '#020b09' : '#f4f6f4',
    field: dark ? '#282827' : '#f9fafb',
    accent: dark ? '#b5cf86' : '#3B4530',
    card: dark ? '#1c1c1c' : '#fff',
    border: dark ? '#2a2a28' : '#e5e7eb',
    text: dark ? '#f0f0f0' : '#111827',
    muted: dark ? '#9ca3af' : '#6b7280',
  };

  useEffect(() => {
    const inquiryQuery = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
    return onSnapshot(inquiryQuery, snapshot => {
      setInquiries(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setLoading(false);
      setError('');
    }, snapshotError => {
      console.error('Could not load contact inquiries:', snapshotError);
      setError('Contact inquiries could not be loaded. Check Firestore permissions for the contacts collection.');
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => inquiries.filter(inquiry => {
    const status = inquiry.status === 'answered' ? 'answered' : 'unanswered';
    const matchesStatus = filter === 'all' || status === filter;
    const queryText = search.trim().toLowerCase();
    const matchesSearch = !queryText || [
      inquiry.firstName, inquiry.lastName, inquiry.name, inquiry.email, inquiry.subject, inquiry.message,
    ].some(value => String(value || '').toLowerCase().includes(queryText));
    return matchesStatus && matchesSearch;
  }), [filter, inquiries, search]);

  const setAnswered = async (inquiry, answered) => {
    setSavingId(inquiry.id);
    setActionError('');
    try {
      await updateDoc(doc(db, 'contacts', inquiry.id), {
        status: answered ? 'answered' : 'unanswered',
        answeredAt: answered ? serverTimestamp() : null,
        read: true,
      });
    } catch (updateError) {
      console.error('Could not update contact inquiry status:', updateError);
      setActionError('The inquiry status could not be updated.');
    } finally {
      setSavingId('');
    }
  };

  const nameOf = inquiry => inquiry.name || `${inquiry.firstName || ''} ${inquiry.lastName || ''}`.trim() || 'Guest';

  const openReply = inquiry => {
    setNotice('');
    setReply({
      inquiry,
      subject: `Re: ${inquiry.subject || 'Your inquiry'}`.slice(0, 200),
      message: `Hi ${inquiry.firstName || nameOf(inquiry).split(' ')[0]},\n\nThank you for contacting Lawiswis Kawayan Garden Resort.\n\n\n\nWarm regards,\n${me?.name || 'Lawiswis Kawayan Garden Resort'}\nLawiswis Kawayan Garden Resort · 0917 811 2332`,
      sending: false,
      error: '',
    });
  };

  // Sends the reply from the resort's Gmail to the guest, with their
  // original message quoted, then marks the inquiry answered.
  const sendReply = async () => {
    if (!reply || reply.sending) return;
    const message = reply.message.trim();
    if (!message) { setReply(r => ({ ...r, error: 'Write your reply first.' })); return; }
    setReply(r => ({ ...r, sending: true, error: '' }));
    const inquiry = reply.inquiry;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in again.');
      const quoted = `${message}\n\n---\nOn ${asDate(inquiry.createdAt)}, ${nameOf(inquiry)} wrote:\n${String(inquiry.message || '').split('\n').map(line => `> ${line}`).join('\n')}`;
      const response = await fetch('/api/email-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: inquiry.email, subject: reply.subject, text: quoted }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The reply could not be sent.');
      await updateDoc(doc(db, 'contacts', inquiry.id), {
        status: 'answered',
        answeredAt: serverTimestamp(),
        read: true,
        replies: arrayUnion({
          message,
          subject: reply.subject,
          sentTo: inquiry.email,
          sentAt: new Date().toISOString(),
          sentByName: me?.name || me?.email || 'Staff',
        }),
      });
      setReply(null);
      setNotice(`Reply sent to ${inquiry.email}.`);
    } catch (sendError) {
      setReply(r => (r ? { ...r, sending: false, error: sendError.message || 'The reply could not be sent.' } : r));
    }
  };

  const asDate = value => {
    const date = value?.toDate?.();
    return date ? date.toLocaleString() : 'Date unavailable';
  };


  return (
    <PageLayout>
      <main style={{ minHeight: '100vh', padding: 20, background: colors.page, color: colors.text, fontFamily: "'Poppins', sans-serif" }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 21, margin: '0 0 5px' }}>Contact inquiries</h1>
            <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>Website messages delivered to lawiswiskawayyyan123@gmail.com.</p>
          </header>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <input aria-label="Search inquiries" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Search name, email, subject, or message"
              style={{ flex: '1 1 240px', minWidth: 0, padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: 9, background: colors.card, color: colors.text }} />
            <select aria-label="Filter inquiries" value={filter} onChange={event => setFilter(event.target.value)}
              style={{ padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: 9, background: colors.card, color: colors.text }}>
              <option value="unanswered">Unanswered</option>
              <option value="answered">Answered</option>
              <option value="all">All inquiries</option>
            </select>
          </div>

          {notice && <div role="status" style={{ color: '#166534', background: '#dcfce7', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12 }}>{notice}</div>}
          {(error || actionError) && <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12 }}>{error || actionError}</div>}

          <div style={{ display: 'grid', gap: 12 }}>
            {loading ? <p style={{ color: colors.muted }}>Loading inquiries…</p>
              : filtered.length === 0 ? <p style={{ color: colors.muted, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>No inquiries match this view.</p>
                : filtered.map(inquiry => {
                  const answered = inquiry.status === 'answered';
                  const name = nameOf(inquiry);
                  const replies = Array.isArray(inquiry.replies) ? inquiry.replies : [];
                  return (
                    <article key={inquiry.id} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${answered ? '#9ca3af' : '#9cb56f'}`, borderRadius: 12, padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>{name}</h2>
                          <div style={{ color: colors.muted, fontSize: 11 }}>{inquiry.email}{inquiry.phone ? ` · ${inquiry.phone}` : ''}</div>
                        </div>
                        <div style={{ color: colors.muted, fontSize: 10 }}>{asDate(inquiry.createdAt)}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 14 }}>{inquiry.subject || 'General Inquiry'}</div>
                      <p style={{ color: colors.muted, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{inquiry.message}</p>
                      {inquiry.emailDelivery === 'failed' && <p style={{ color: '#b91c1c', fontSize: 11 }}>Email delivery to the resort inbox failed; message is saved here.</p>}
                      {replies.map((sent, index) => (
                        <div key={index} style={{ margin: '0 0 10px', padding: '10px 12px', borderRadius: 8, background: colors.field, border: `1px solid ${colors.border}`, fontSize: 12 }}>
                          <div style={{ color: colors.muted, fontSize: 10, marginBottom: 4 }}>
                            Replied by {sent.sentByName || 'staff'} to {sent.sentTo} · {sent.sentAt ? new Date(sent.sentAt).toLocaleString() : ''}
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{sent.message}</div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" disabled={!inquiry.email} onClick={() => openReply(inquiry)}
                          style={{ border: 0, borderRadius: 8, padding: '8px 14px', background: '#3B4530', color: '#fff', fontSize: 11, fontWeight: 600, cursor: inquiry.email ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <i className="ti ti-arrow-back-up" aria-hidden="true" style={{ fontSize: 14 }} /> {replies.length ? 'Reply again' : 'Reply'}
                        </button>
                        <button type="button" disabled={savingId === inquiry.id} onClick={() => setAnswered(inquiry, !answered)}
                          style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 12px', background: 'transparent', color: colors.text, fontSize: 11, fontWeight: 600, cursor: savingId === inquiry.id ? 'wait' : 'pointer' }}>
                          {savingId === inquiry.id ? 'Saving…' : answered ? 'Mark unanswered' : 'Mark answered'}
                        </button>
                      </div>
                    </article>
                  );
                })}
          </div>
        </div>
      </main>

      {reply && (
        <div role="presentation" onClick={event => { if (event.target === event.currentTarget && !reply.sending) setReply(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="reply-title"
            style={{ width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto', background: colors.card, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 22, fontFamily: "'Poppins', sans-serif", boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 id="reply-title" style={{ fontSize: 17, margin: '0 0 14px' }}>Reply to {nameOf(reply.inquiry)}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 12, marginBottom: 14, background: colors.field, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
              <span style={{ color: colors.muted }}>Send to</span>
              <strong style={{ overflowWrap: 'anywhere', color: colors.accent }}>{reply.inquiry.email}</strong>
              <span style={{ color: colors.muted }}>From</span>
              <span>Lawiswis Kawayan Garden Resort (resort Gmail)</span>
              <span style={{ color: colors.muted }}>Their message</span>
              <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 110, overflowY: 'auto', color: colors.muted }}>{reply.inquiry.message}</span>
            </div>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 600, color: colors.muted, marginBottom: 10 }}>
              Subject
              <input value={reply.subject} maxLength={200} onChange={event => setReply(r => ({ ...r, subject: event.target.value }))}
                style={{ padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: 9, background: colors.field, color: colors.text, font: 'inherit', fontSize: 13 }} />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 600, color: colors.muted }}>
              Your reply (answer their question here)
              <textarea value={reply.message} rows={10} maxLength={10000} autoFocus onChange={event => setReply(r => ({ ...r, message: event.target.value }))}
                style={{ padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: 9, background: colors.field, color: colors.text, font: 'inherit', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
            </label>
            <p style={{ color: colors.muted, fontSize: 11, margin: '8px 0 0' }}>Their original message is added below your reply automatically. The inquiry is marked answered once it's sent.</p>
            {reply.error && <div role="alert" style={{ color: '#b91c1c', fontSize: 12, marginTop: 10 }}>{reply.error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" disabled={reply.sending} onClick={() => setReply(null)}
                style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 14px', background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button type="button" disabled={reply.sending} onClick={sendReply}
                style={{ border: 0, borderRadius: 8, padding: '9px 16px', background: '#3B4530', color: '#fff', fontWeight: 700, cursor: reply.sending ? 'wait' : 'pointer', fontSize: 12 }}>
                {reply.sending ? 'Sending…' : `Send to ${reply.inquiry.email}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </PageLayout>
  );
}
