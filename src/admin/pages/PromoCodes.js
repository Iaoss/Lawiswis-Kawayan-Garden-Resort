import React, { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

const emptyForm = {
  code: '', discountType: 'percentage', discountValue: '', validFrom: '', validUntil: '',
  usageLimit: '', minimumSpend: '', active: true,
};

export default function PromoCodes() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;
  const BG = dark ? '#020b09' : '#f4f6f4';
  const CARD = dark ? '#1c1c1c' : '#fff';
  const CARD2 = dark ? '#282827' : '#f9fafb';
  const BORDER = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT = dark ? '#f0f0f0' : '#111827';
  const MUTED = dark ? '#9ca3af' : '#6b7280';
  const ACCENT = settings?.accentColor || '#9cb56f';
  const [promos, setPromos] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingCode, setEditingCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const fetchPromos = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, 'promoCodes'));
      setPromos(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => a.code.localeCompare(b.code)));
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not load promo codes.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingCode('');
  };

  const editPromo = promo => {
    setEditingCode(promo.id);
    setForm({
      code: promo.code || promo.id,
      discountType: promo.discountType || 'percentage',
      discountValue: String(promo.discountValue ?? ''),
      validFrom: promo.validFrom || '',
      validUntil: promo.validUntil || '',
      usageLimit: promo.usageLimit == null ? '' : String(promo.usageLimit),
      minimumSpend: promo.minimumSpend == null ? '' : String(promo.minimumSpend),
      active: Boolean(promo.active),
    });
    setNotice(null);
  };

  const savePromo = async event => {
    event.preventDefault();
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discountValue);
    const usageLimit = form.usageLimit === '' ? null : Number(form.usageLimit);
    const minimumSpend = form.minimumSpend === '' ? 0 : Number(form.minimumSpend);
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      setNotice({ type: 'error', text: 'Use 3–32 letters, numbers, hyphens, or underscores for the code.' });
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || (form.discountType === 'percentage' && value > 100)) {
      setNotice({ type: 'error', text: 'Enter a valid discount value. Percentages must be 1–100.' });
      return;
    }
    if (!form.validFrom || !form.validUntil || form.validUntil < form.validFrom) {
      setNotice({ type: 'error', text: 'Set a valid start and expiration date.' });
      return;
    }
    if ((usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1))
      || !Number.isFinite(minimumSpend) || minimumSpend < 0) {
      setNotice({ type: 'error', text: 'Check the usage limit and minimum spend.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const promoRef = doc(db, 'promoCodes', editingCode || code);
      const values = {
        code,
        discountType: form.discountType,
        discountValue: value,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        usageLimit,
        minimumSpend,
        active: Boolean(form.active),
        updatedAt: new Date().toISOString(),
      };
      if (editingCode) {
        await updateDoc(promoRef, values);
      } else {
        if (promos.some(promo => promo.id === code)) throw new Error('A promo code with this code already exists.');
        await setDoc(promoRef, { ...values, usageCount: 0, createdAt: new Date().toISOString() });
      }
      await fetchPromos();
      resetForm();
      setNotice({ type: 'success', text: `${code} saved.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not save promo code.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async promo => {
    try {
      await updateDoc(doc(db, 'promoCodes', promo.id), { active: !promo.active, updatedAt: new Date().toISOString() });
      await fetchPromos();
      setNotice({ type: 'success', text: `${promo.code} ${promo.active ? 'deactivated' : 'activated'}.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not update promo code.' });
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', background: CARD2, border: `1px solid ${BORDER}`,
    borderRadius: '6px', padding: '9px 10px', color: TEXT, fontSize: '12px', outline: 'none',
  };
  const labelStyle = { display: 'grid', gap: '6px', color: MUTED, fontSize: '11px', fontWeight: 600 };
  const field = (key, label, type = 'text', extra = {}) => (
    <label key={key} style={labelStyle}>{label}
      <input type={type} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))}
        style={inputStyle} {...extra} />
    </label>
  );

  return (
    <PageLayout>
      <main style={{ minHeight: '100vh', padding: '24px', background: BG, color: TEXT, fontFamily: "'Poppins', sans-serif" }}>
        <h1 style={{ margin: '0 0 5px', fontSize: '20px' }}>Promos & Discounts</h1>
        <p style={{ margin: '0 0 20px', color: MUTED, fontSize: '12px' }}>Manage booking promo codes and redemption limits.</p>

        {notice && <div role="status" style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', color: notice.type === 'error' ? '#991b1b' : '#166534', background: notice.type === 'error' ? '#fee2e2' : '#dcfce7' }}>{notice.text}</div>}

        <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '18px', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '14px' }}>{editingCode ? `Edit ${editingCode}` : 'Create promo code'}</h2>
          <form onSubmit={savePromo}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
              {field('code', 'Code', 'text', { maxLength: 32, disabled: Boolean(editingCode), placeholder: 'SUMMER20' })}
              <label style={labelStyle}>Discount type
                <select value={form.discountType} onChange={event => setForm(previous => ({ ...previous, discountType: event.target.value }))} style={inputStyle}>
                  <option value="percentage">Percentage</option><option value="fixed">Fixed amount</option>
                </select>
              </label>
              {field('discountValue', form.discountType === 'percentage' ? 'Discount (%)' : 'Discount (₱)', 'number', { min: '0.01', max: form.discountType === 'percentage' ? 100 : undefined, step: '0.01' })}
              {field('validFrom', 'Starts on', 'date')}
              {field('validUntil', 'Expires on', 'date')}
              {field('usageLimit', 'Usage limit (optional)', 'number', { min: 1, step: 1, placeholder: 'Unlimited' })}
              {field('minimumSpend', 'Minimum spend (₱)', 'number', { min: 0, step: '0.01', placeholder: '0' })}
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'end', minHeight: '38px', color: TEXT }}>
                <input type="checkbox" checked={form.active} onChange={event => setForm(previous => ({ ...previous, active: event.target.checked }))} /> Active
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button type="submit" disabled={saving} style={{ background: ACCENT, color: '#10200e', border: 0, borderRadius: '6px', padding: '9px 14px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving…' : editingCode ? 'Save changes' : 'Create promo'}</button>
              {editingCode && <button type="button" onClick={resetForm} style={{ background: CARD2, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '9px 14px', cursor: 'pointer' }}>Cancel</button>}
            </div>
          </form>
        </section>

        <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
            <thead><tr>{['Code', 'Discount', 'Validity', 'Usage', 'Minimum spend', 'Status', 'Actions'].map(heading => <th key={heading} style={{ textAlign: 'left', padding: '12px', borderBottom: `1px solid ${BORDER}`, color: MUTED, fontSize: '10px', textTransform: 'uppercase' }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: MUTED }}>Loading promo codes…</td></tr>
                : promos.length === 0 ? <tr><td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: MUTED }}>No promo codes yet.</td></tr>
                  : promos.map(promo => <tr key={promo.id}>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700 }}>{promo.code || promo.id}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}` }}>{promo.discountType === 'percentage' ? `${promo.discountValue}%` : `₱${Number(promo.discountValue).toLocaleString()}`}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px' }}>{promo.validFrom} – {promo.validUntil}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}` }}>{Number(promo.usageCount || 0)} / {promo.usageLimit || '∞'}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}` }}>₱{Number(promo.minimumSpend || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: promo.active ? '#15803d' : '#b91c1c' }}>{promo.active ? 'Active' : 'Inactive'}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => editPromo(promo)} style={{ background: 'transparent', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: '5px', padding: '6px 9px', cursor: 'pointer', marginRight: '6px' }}>Edit</button>
                      <button type="button" onClick={() => toggleActive(promo)} style={{ background: 'transparent', color: promo.active ? '#b91c1c' : '#15803d', border: `1px solid ${BORDER}`, borderRadius: '5px', padding: '6px 9px', cursor: 'pointer' }}>{promo.active ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>)}
            </tbody>
          </table>
        </section>
      </main>
    </PageLayout>
  );
}
