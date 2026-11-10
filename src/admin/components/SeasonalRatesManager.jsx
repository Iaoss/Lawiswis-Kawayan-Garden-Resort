import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { getSeasonPeriodError, normalizeSeasonPeriods } from '../../lib/seasonalRates';
import { logStaffActivity } from '../lib/activityLog';
import { appConfirm } from '../../components/ui/app-dialog';

// Admin: holiday and peak-season prices (Holy Week, Christmas, summer
// weekends). Each period raises (or lowers) room rates by a percentage for
// the nights inside it. Saved in settings/seasonalRates; the website, walk-ins
// and the server all price from it. See src/lib/seasonalRates.js.

const EMPTY = { id: '', name: '', from: '', to: '', percent: 20 };
const newId = () => `season_${Date.now().toString(36)}`;
const fmt = key => (key ? new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export default function SeasonalRatesManager({ colors }) {
  const c = colors;
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => onSnapshot(doc(db, 'settings', 'seasonalRates'),
    snapshot => setPeriods(normalizeSeasonPeriods(snapshot.data())),
    () => setPeriods([])), []);

  const today = new Date().toISOString().slice(0, 10);
  const current = periods.filter(p => p.to >= today);

  const save = async next => {
    await setDoc(doc(db, 'settings', 'seasonalRates'), {
      periods: next.map(({ id, name, from, to, percent }) => ({ id, name, from, to, percent })),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.email || '',
    });
  };

  const submit = async event => {
    event.preventDefault();
    const period = { ...form, id: form.id || newId(), name: form.name.trim(), percent: Number(form.percent) };
    const problem = getSeasonPeriodError(period, periods);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      await save([...periods.filter(p => p.id !== period.id), period]);
      logStaffActivity('season_rate_saved', `${form.id ? 'Updated' : 'Added'} seasonal rate "${period.name}" ${period.from} to ${period.to}: ${period.percent > 0 ? '+' : ''}${period.percent}%`);
      setForm(null);
    } catch (saveError) {
      setError(saveError.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async period => {
    const ok = await appConfirm(`Remove "${period.name}"? New bookings on those dates go back to the normal price. Existing bookings keep their price.`, { title: 'Remove this period?', confirmLabel: 'Remove' });
    if (!ok) return;
    try {
      await save(periods.filter(p => p.id !== period.id));
      logStaffActivity('season_rate_removed', `Removed seasonal rate "${period.name}" (${period.from} to ${period.to})`);
    } catch (removeError) {
      setError(removeError.message || 'Could not remove.');
    }
  };

  const input = { background: c.INPUT_BG, border: `1px solid ${c.BORDER}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, color: c.TEXT, fontFamily: 'inherit', minWidth: 0 };
  const btn = { border: `1px solid ${c.BORDER}`, background: 'transparent', color: c.TEXT, borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <section style={{ background: c.CARD, border: `1px solid ${c.BORDER}`, borderRadius: 18, padding: '16px 20px', marginBottom: 16 }}>
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 10 }}>
        <span>
          <span style={{ fontSize: 14, fontWeight: 700, color: c.TEXT }}><i className="ti ti-calendar-dollar" aria-hidden="true" /> Holiday &amp; peak-season rates</span>
          <span style={{ display: 'block', fontSize: 12, color: c.SUBTEXT, marginTop: 2 }}>
            {current.length ? `${current.length} upcoming: ${current.slice(0, 3).map(p => `${p.name} ${p.percent > 0 ? '+' : ''}${p.percent}%`).join(', ')}` : 'None set. Every date uses the normal room rates.'}
          </span>
        </span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" style={{ color: c.SUBTEXT }} />
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: c.SUBTEXT, lineHeight: 1.6 }}>
            The percentage changes the room rate (and extra-guest charges) for nights inside the period. Cottages, entrance fees and group packages stay the same.
            Bookings already made keep their price.
          </p>
          {periods.length === 0 && <div style={{ fontSize: 12, color: c.SUBTEXT }}>No periods yet.</div>}
          {periods.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: `1px solid ${c.BORDER}`, borderRadius: 10, padding: '9px 12px', opacity: p.to < today ? 0.55 : 1 }}>
              <div>
                <strong style={{ fontSize: 13, color: c.TEXT }}>{p.name}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: p.percent > 0 ? '#b45309' : '#15803d' }}>{p.percent > 0 ? '+' : ''}{p.percent}%</span>
                <div style={{ fontSize: 11.5, color: c.SUBTEXT }}>{fmt(p.from)} to {fmt(p.to)}{p.to < today ? ' · ended' : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={btn} onClick={() => { setForm({ ...p }); setError(''); }}>Edit</button>
                <button type="button" style={{ ...btn, color: '#dc2626' }} onClick={() => remove(p)}>Remove</button>
              </div>
            </div>
          ))}
          {!form ? (
            <div><button type="button" style={btn} onClick={() => { setForm({ ...EMPTY }); setError(''); }}>+ Add a period</button></div>
          ) : (
            <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end', borderTop: `1px solid ${c.BORDER}`, paddingTop: 12 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 600, color: c.SUBTEXT }}>Name
                <input value={form.name} maxLength={40} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Holy Week" style={input} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 600, color: c.SUBTEXT }}>From
                <input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value, to: form.to && form.to >= e.target.value ? form.to : e.target.value })} style={input} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 600, color: c.SUBTEXT }}>To
                <input type="date" value={form.to} min={form.from || undefined} onChange={e => setForm({ ...form, to: e.target.value })} style={input} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 600, color: c.SUBTEXT }}>Change (%)
                <input type="number" step="1" min="-50" max="100" value={form.percent} onChange={e => setForm({ ...form, percent: e.target.value })} style={input} />
              </label>
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: c.SUBTEXT }}>Use 20 for 20% more, or −10 for a 10% discount (low season).</div>
              {error && <div role="alert" style={{ gridColumn: '1 / -1', fontSize: 12, color: '#dc2626' }}>{error}</div>}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" style={btn} onClick={() => { setForm(null); setError(''); }}>Cancel</button>
                <button type="submit" disabled={busy} style={{ ...btn, background: c.ACCENT, color: '#0a1a0a', border: 'none' }}>{busy ? 'Saving…' : 'Save period'}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
