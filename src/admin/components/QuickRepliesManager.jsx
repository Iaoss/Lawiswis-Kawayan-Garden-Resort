import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/firebase';
import { collection, onSnapshot, addDoc, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { DEFAULT_QUICK_REPLIES, sortQuickReplies } from './quickReplyDefaults';
import { appConfirm } from '../../components/ui/app-dialog';

const EMPTY = { question: '', answer: '' };

export default function QuickRepliesManager({ t }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(null); // null = closed, otherwise { id?, question, answer }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(collection(db, 'faqs'),
    snap => { setItems(sortQuickReplies(snap.docs.map(d => ({ id: d.id, ...d.data() })))); setLoaded(true); },
    err => { setError(err.message || 'Could not load quick replies.'); setLoaded(true); }), []);

  const input = {
    width: '100%', boxSizing: 'border-box', border: `1px solid ${t.BORDER}`, borderRadius: 9,
    padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', background: t.CARD2, color: t.TEXT, outline: 'none',
  };
  const btn = (primary) => ({
    padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: primary ? 0 : `1px solid ${t.BORDER}`,
    background: primary ? t.ACCENT : 'transparent', color: primary ? t.ACCENT_TEXT : t.TEXT,
  });

  const save = async () => {
    const question = form.question.trim();
    const answer = form.answer.trim();
    if (!question || !answer) { setError('Both a title and a message are required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (form.id) {
        await setDoc(doc(db, 'faqs', form.id), { question, answer }, { merge: true });
      } else {
        const nextOrder = items.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1;
        await addDoc(collection(db, 'faqs'), { question, answer, category: 'General', order: nextOrder, createdAt: serverTimestamp() });
      }
      setForm(null);
    } catch (e) {
      setError(e.message || 'Could not save the quick reply.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!(await appConfirm(`"${item.question}" will be removed for all staff.`, { title: 'Delete this quick reply?', tone: 'danger', confirmLabel: 'Delete' }))) return;
    try { await deleteDoc(doc(db, 'faqs', item.id)); } catch (e) { setError(e.message || 'Could not delete.'); }
  };

  const usingDefaults = loaded && items.length === 0;
  const rows = usingDefaults ? DEFAULT_QUICK_REPLIES : items;

  return (
    <div style={{ background: t.CARD, borderRadius: 16, border: `1px solid ${t.BORDER}`, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.TEXT }}>Quick Replies</div>
          <div style={{ fontSize: 11, color: t.MUTED }}>Saved messages staff can insert from the chat widget.</div>
        </div>
        <button type="button" style={btn(true)} onClick={() => { setError(''); setForm({ ...EMPTY }); }}>+ Add Quick Reply</button>
      </div>

      {usingDefaults && (
        <div style={{ fontSize: 12, color: t.SUBTEXT, background: t.CARD2, borderRadius: 9, padding: '8px 12px', marginBottom: 12 }}>
          Showing default replies. Add your own and these defaults are replaced.
        </div>
      )}
      {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {form && (
        <div style={{ border: `1px solid ${t.BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.TEXT }}>{form.id ? 'Edit Quick Reply' : 'New Quick Reply'}</div>
          <input style={input} maxLength={60} placeholder="Label / Title (e.g., Check-in Time)" value={form.question}
            onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
          <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} maxLength={1000} placeholder="Message body inserted into the chat"
            value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" style={btn(false)} onClick={() => { setForm(null); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {!loaded ? <div style={{ color: t.MUTED, fontSize: 12 }}>Loading…</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map(item => (
            <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', border: `1px solid ${t.BORDER}`, borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.TEXT }}>{item.question}</div>
                <div style={{ fontSize: 12, color: t.SUBTEXT, marginTop: 3, whiteSpace: 'pre-wrap' }}>{item.answer}</div>
              </div>
              {!usingDefaults && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" style={btn(false)} onClick={() => { setError(''); setForm({ id: item.id, question: item.question || '', answer: item.answer || '' }); }}>Edit</button>
                  <button type="button" style={{ ...btn(false), color: '#b91c1c' }} onClick={() => remove(item)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
