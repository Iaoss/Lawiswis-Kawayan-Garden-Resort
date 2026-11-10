import React, { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { DEFAULT_COTTAGES, getCottageCatalogError, normalizeCottageCatalog } from '../../lib/bookingPricing';
import { applySavedCottageCatalog } from '../../lib/useCottageCatalog';
import { logStaffActivity } from '../lib/activityLog';
import { appConfirm } from '../../components/ui/app-dialog';

// Admin: the resort's cottages. Add, rename, change size and price, remove,
// and set how many of each there are. Saved in settings/cottageTypes (the
// list) and siteSettings/cottageInventory (the counts). The website, walk-ins
// and the server's price checks all use this list.
// Removing a cottage hides it from new bookings; old bookings keep its name
// and price, and it can be restored.

const slug = name => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'cottage';
const newId = (name, taken) => {
  let id = slug(name);
  if (id.length < 2) id = `cottage-${id}`;
  while (taken.has(id)) id = `${slug(name)}-${Math.random().toString(36).slice(2, 5)}`;
  return id;
};

export default function CottageInventoryManager({ t }) {
  const [rows, setRows] = useState(null);          // [{ id, name, maxGuests, price, archived, count, isNew }]
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'settings', 'cottageTypes')),
      fetch('/api/cottage-availability').then(r => (r.ok ? r.json() : { inventory: {} })).catch(() => ({ inventory: {} })),
    ]).then(([snapshot, counts]) => {
      const saved = snapshot.exists() ? normalizeCottageCatalog(snapshot.data()) : null;
      const list = saved || DEFAULT_COTTAGES.map(c => ({ ...c, archived: false }));
      setRows(list.map(c => ({ ...c, count: counts.inventory?.[c.id] ?? '' })));
    }).catch(() => {
      setRows(DEFAULT_COTTAGES.map(c => ({ ...c, archived: false, count: '' })));
      setMessage({ type: 'error', text: 'The saved cottages could not be loaded. Showing the defaults.' });
    });
  }, []);

  const update = (id, field, value) => {
    setRows(list => list.map(r => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty(true);
    setMessage(null);
  };

  const add = () => {
    setRows(list => [...list, { id: `new-${Date.now()}`, name: '', maxGuests: 6, price: 500, archived: false, count: '', isNew: true }]);
    setDirty(true);
  };

  const remove = async row => {
    if (row.isNew) { setRows(list => list.filter(r => r.id !== row.id)); return; }
    const ok = await appConfirm(`"${row.name}" won't be offered for new bookings. Bookings that already have it keep it, and you can restore it later.`, {
      title: 'Remove this cottage?', tone: 'warning', confirmLabel: 'Remove',
    });
    if (ok) update(row.id, 'archived', true);
  };

  const save = async () => {
    const active = rows.filter(r => !r.archived);
    for (const row of active) {
      const problem = getCottageCatalogError(row, rows);
      if (problem) { setMessage({ type: 'error', text: `${row.name || 'New cottage'}: ${problem}` }); return; }
      if (row.count !== '' && !(Number.isInteger(Number(row.count)) && Number(row.count) >= 0 && Number(row.count) <= 100)) {
        setMessage({ type: 'error', text: `${row.name}: the count must be a whole number from 0 to 100, or empty for no limit.` });
        return;
      }
    }
    setSaving(true);
    setMessage(null);
    try {
      const taken = new Set(rows.filter(r => !r.isNew).map(r => r.id));
      const finalRows = rows.map(r => {
        if (!r.isNew) return r;
        const id = newId(r.name, taken);
        taken.add(id);
        return { ...r, id, isNew: false };
      });
      const cottages = finalRows.map(r => ({ id: r.id, name: r.name.trim(), maxGuests: Number(r.maxGuests), price: Number(r.price), archived: Boolean(r.archived) }));
      await setDoc(doc(db, 'settings', 'cottageTypes'), { cottages, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '' });
      applySavedCottageCatalog(cottages);

      // Counts for the cottages still offered.
      const token = await auth.currentUser?.getIdToken();
      const counts = Object.fromEntries(finalRows.filter(r => !r.archived).map(r => [r.id, r.count === '' ? null : Number(r.count)]));
      const response = await fetch('/api/cottage-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(counts),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The cottages were saved, but the counts could not be saved.');

      logStaffActivity('cottages_updated', `Updated cottages: ${cottages.filter(c => !c.archived).map(c => `${c.name} (${c.maxGuests} guests, ₱${c.price.toLocaleString('en-PH')})`).join(', ')}`.slice(0, 300));
      setRows(finalRows);
      setDirty(false);
      setMessage({ type: 'ok', text: 'Cottages saved. The website and walk-ins use them now.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'The cottages could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${t.BORDER}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, background: t.CARD2, color: t.TEXT, outline: 'none', fontFamily: 'inherit' };
  const head = { fontSize: 10.5, fontWeight: 700, color: t.MUTED, textTransform: 'uppercase', letterSpacing: '.05em' };
  const active = rows?.filter(r => !r.archived) || [];
  const archived = rows?.filter(r => r.archived) || [];
  const cols = 'minmax(140px, 2fr) minmax(80px, 1fr) minmax(90px, 1fr) minmax(90px, 1fr) 70px';

  return (
    <div style={{ borderTop: `1px solid ${t.BORDER}`, paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.TEXT }}>Cottages</div>
      <div style={{ fontSize: 12, color: t.SUBTEXT, margin: '3px 0 12px', lineHeight: 1.6 }}>
        The cottages guests and staff can book, with their size and price. "How many" limits bookings per date and tour time (leave it empty for no limit).
      </div>
      {!rows ? <div style={{ color: t.MUTED, fontSize: 12 }}>Loading…</div> : (
        <>
          <div className="keep-columns" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', overflowX: 'auto' }}>
            <span style={head}>Name</span><span style={head}>Up to guests</span><span style={head}>Price (₱)</span><span style={head}>How many</span><span />
            {active.map(row => (
              <React.Fragment key={row.id}>
                <input aria-label="Cottage name" value={row.name} maxLength={40} placeholder="e.g. Bamboo Kubo" onChange={e => update(row.id, 'name', e.target.value)} style={input} />
                <input aria-label="Up to guests" type="number" min="1" max="200" value={row.maxGuests} onChange={e => update(row.id, 'maxGuests', e.target.value)} style={input} />
                <input aria-label="Price" type="number" min="1" max="100000" value={row.price} onChange={e => update(row.id, 'price', e.target.value)} style={input} />
                <input aria-label="How many" type="number" min="0" max="100" placeholder="No limit" value={row.count} onChange={e => update(row.id, 'count', e.target.value)} style={input} />
                <button type="button" onClick={() => remove(row)} style={{ border: `1px solid ${t.BORDER}`, background: 'transparent', color: '#dc2626', borderRadius: 8, padding: '7px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
              </React.Fragment>
            ))}
          </div>
          {active.length === 0 && <div style={{ fontSize: 12, color: t.MUTED, marginTop: 8 }}>No cottages. Guests can't add a cottage or book a cottage-only tour.</div>}
          <button type="button" onClick={add} style={{ marginTop: 10, border: `1px dashed ${t.BORDER}`, background: 'transparent', color: t.TEXT, borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Add a cottage
          </button>

          {archived.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...head, marginBottom: 6 }}>Removed (kept for old bookings)</div>
              {archived.map(row => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12.5, color: t.SUBTEXT, padding: '6px 0', borderTop: `1px solid ${t.BORDER}` }}>
                  <span>{row.name} · up to {row.maxGuests} guests · ₱{Number(row.price).toLocaleString('en-PH')}</span>
                  <button type="button" onClick={() => update(row.id, 'archived', false)} style={{ border: `1px solid ${t.BORDER}`, background: 'transparent', color: t.TEXT, borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Restore</button>
                </div>
              ))}
            </div>
          )}

          {message && <div role={message.type === 'error' ? 'alert' : 'status'} style={{ color: message.type === 'error' ? '#b91c1c' : '#15803d', fontSize: 12, marginTop: 10 }}>{message.text}</div>}
          <div style={{ fontSize: 11.5, color: t.MUTED, marginTop: 10 }}>Price changes apply to new bookings. Existing bookings keep the price they were booked at.</div>
          <button type="button" onClick={save} disabled={saving || !dirty}
            style={{ margin: '12px 0 16px', padding: '9px 16px', border: 0, borderRadius: 9, background: t.ACCENT, color: t.ACCENT_TEXT, fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving || !dirty ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save cottages'}
          </button>
        </>
      )}
    </div>
  );
}
