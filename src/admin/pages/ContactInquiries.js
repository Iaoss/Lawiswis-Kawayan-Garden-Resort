import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
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

  const colors = {
    page: dark ? '#020b09' : '#f4f6f4',
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
            <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>Website messages delivered to info@lawiswiskawayanresort.com.</p>
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

          {(error || actionError) && <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12 }}>{error || actionError}</div>}

          <div style={{ display: 'grid', gap: 12 }}>
            {loading ? <p style={{ color: colors.muted }}>Loading inquiries…</p>
              : filtered.length === 0 ? <p style={{ color: colors.muted, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>No inquiries match this view.</p>
                : filtered.map(inquiry => {
                  const answered = inquiry.status === 'answered';
                  const name = inquiry.name || `${inquiry.firstName || ''} ${inquiry.lastName || ''}`.trim() || 'Guest';
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
                      <button type="button" disabled={savingId === inquiry.id} onClick={() => setAnswered(inquiry, !answered)}
                        style={{ border: 0, borderRadius: 8, padding: '8px 12px', background: answered ? '#e5e7eb' : '#3B4530', color: answered ? '#374151' : '#fff', fontSize: 11, fontWeight: 600, cursor: savingId === inquiry.id ? 'wait' : 'pointer' }}>
                        {savingId === inquiry.id ? 'Saving…' : answered ? 'Mark unanswered' : 'Mark answered'}
                      </button>
                    </article>
                  );
                })}
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
