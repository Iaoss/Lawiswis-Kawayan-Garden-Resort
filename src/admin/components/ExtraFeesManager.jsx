import React, { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { DEFAULT_EXTRA_FEES, feeIdFor, normalizeExtraFees } from '../../lib/extraFees';
import { setCachedExtraFees } from '../lib/useExtraFees';
import { logStaffActivity } from '../lib/activityLog';

// Admin: the common fees staff can pick in Billing → Add charges
// (broken furniture, lost key, corkage…). A price is optional.
export default function ExtraFeesManager({ t }) {
  const [rows, setRows] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'extraFees'))
      .then(snapshot => setRows(((snapshot.exists() && normalizeExtraFees(snapshot.data())) || DEFAULT_EXTRA_FEES).map(fee => ({ ...fee, amount: fee.amount ?? '' }))))
      .catch(() => {
        setRows(DEFAULT_EXTRA_FEES.map(fee => ({ ...fee, amount: '' })));
        setMessage({ type: 'error', text: 'The saved fees could not be loaded. Showing the defaults.' });
      });
  }, []);

  const change = (id, field, value) => {
    setRows(list => list.map(row => (row.id === id ? { ...row, [field]: value } : row)));
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    const bad = rows.find(row => row.label.trim().length < 2 || (row.amount !== '' && !(Number(row.amount) > 0)));
    if (bad) { setMessage({ type: 'error', text: bad.label.trim().length < 2 ? 'Every fee needs a name.' : `Enter a price above ₱0 for "${bad.label}", or leave it empty.` }); return; }
    setSaving(true);
    try {
      const taken = new Set();
      const fees = rows.map(row => {
        const id = row.isNew ? feeIdFor(row.label, taken) : row.id;
        taken.add(id);
        return { id, label: row.label.trim().slice(0, 80), amount: row.amount === '' ? null : Number(row.amount) };
      });
      await setDoc(doc(db, 'settings', 'extraFees'), { fees, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '' });
      setCachedExtraFees(normalizeExtraFees({ fees }));
      setRows(fees.map(fee => ({ ...fee, amount: fee.amount ?? '' })));
      logStaffActivity('extra_fees_updated', `Updated the common fees list (${fees.length} fees)`);
      setDirty(false);
      setMessage({ type: 'ok', text: 'Fees saved. Billing uses them now.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'The fees could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${t.BORDER}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, background: t.CARD2, color: t.TEXT, outline: 'none', fontFamily: 'inherit' };
  return (
    <div style={{ borderTop: `1px solid ${t.BORDER}`, paddingTop: 14, marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.TEXT }}>Common fees</div>
      <div style={{ fontSize: 12, color: t.SUBTEXT, margin: '3px 0 12px', lineHeight: 1.6 }}>
        Fees staff can pick in Billing → Add charges, like broken furniture or a lost key. Leave the price empty if it depends on the damage; staff then type the amount.
      </div>
      {!rows ? <div style={{ color: t.MUTED, fontSize: 12 }}>Loading…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 3fr) minmax(90px, 1fr) 70px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.MUTED, textTransform: 'uppercase' }}>Fee</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.MUTED, textTransform: 'uppercase' }}>Price (₱)</span>
            <span />
            {rows.map(row => (
              <React.Fragment key={row.id}>
                <input aria-label="Fee name" value={row.label} maxLength={80} onChange={e => change(row.id, 'label', e.target.value)} style={input} />
                <input aria-label="Price" type="number" min="1" placeholder="Staff enters" value={row.amount} onChange={e => change(row.id, 'amount', e.target.value)} style={input} />
                <button type="button" onClick={() => { setRows(list => list.filter(item => item.id !== row.id)); setDirty(true); }}
                  style={{ border: `1px solid ${t.BORDER}`, background: 'transparent', color: '#dc2626', borderRadius: 8, padding: '7px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <button type="button" onClick={() => { setRows(list => [...list, { id: `new-${Date.now()}`, label: '', amount: '', isNew: true }]); setDirty(true); }}
              style={{ border: `1px dashed ${t.BORDER}`, background: 'transparent', color: t.TEXT, borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add a fee</button>
            <button type="button" onClick={save} disabled={saving || !dirty}
              style={{ border: 0, background: t.ACCENT, color: t.ACCENT_TEXT, borderRadius: 9, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: saving || !dirty ? 'not-allowed' : 'pointer', opacity: saving || !dirty ? 0.6 : 1, fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save fees'}
            </button>
            {message && <span role={message.type === 'error' ? 'alert' : 'status'} style={{ fontSize: 12, color: message.type === 'error' ? '#dc2626' : '#15803d' }}>{message.text}</span>}
          </div>
        </>
      )}
    </div>
  );
}
