import React, { useState } from 'react';
import { staffApi } from '../lib/staffApi';
import { money } from '../lib/money';
import {
  CHECK_METHODS, DISCOUNT_KINDS, PHILSYS_VERIFY_URL, PWD_VERIFY_URL, calculateSeniorPwdDiscount, formatPwdId, getDiscountIdError,
} from '../../lib/seniorPwdDiscount';

const empty = { kind: 'senior', holderName: '', idNumber: '', birthDate: '', expiryDate: '', checked: false, checkMethod: '' };

// The official sites block being shown inside other websites, so they open
// in a window on the right side of the screen, with the ID number copied
// (staff paste it with Ctrl+V).
function openLookup(url, textToCopy) {
  if (textToCopy) navigator.clipboard?.writeText(textToCopy).catch(() => {});
  const width = Math.min(760, Math.round(window.screen.availWidth * 0.48));
  const height = Math.round(window.screen.availHeight * 0.9);
  const left = Math.max(0, window.screen.availWidth - width);
  const opened = window.open(url, 'lkgr-id-check', `popup=yes,width=${width},height=${height},left=${left},top=20`);
  if (!opened) window.open(url, '_blank', 'noopener');
}

// Billing → "Senior citizen / PWD discount". One ID = one guest. Staff check
// the physical ID; the system checks the details make sense and that the
// same ID isn't used twice for the same dates.
export default function SeniorPwdDiscountForm({ reservation, colors, inp, btn, onApplied }) {
  const { TEXT, SUBTEXT, MUTED, BORDER, RED = '#dc2626' } = colors;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const totalGuests = Math.max(1, Number(reservation.totalGuests || 0) || (Number(reservation.adults || 0) + Number(reservation.children || 0)) || 1);
  const used = reservation.discounts || [];
  const preview = calculateSeniorPwdDiscount({ amount: reservation.totalAmount, totalGuests, qualifiedGuests: 1 });
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError(''); };

  const apply = async () => {
    if (!form.checkMethod) { setError('Choose how you checked the ID.'); return; }
    const problem = getDiscountIdError({ ...form, today });
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const result = await staffApi('staff-billing', { action: 'apply-discount', reservationId: reservation.id, ...form, qualifiedGuests: 1 });
      setForm(empty);
      setOpen(false);
      onApplied?.(result);
    } catch (applyError) {
      setError(applyError.message || 'The discount could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const small = { fontSize: 11, fontWeight: 600, color: SUBTEXT };
  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 10, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={small}>Senior citizen / PWD discount</span>
        {!open && used.length < totalGuests && (
          <button type="button" onClick={() => { setForm(f => ({ ...f, holderName: f.holderName || (used.length ? '' : reservation.guestName || '') })); setOpen(true); }} style={btn()}>Add discount</button>
        )}
      </div>
      {used.map(item => (
        <div key={item.id} style={{ fontSize: 11.5, color: TEXT, marginTop: 6 }}>
          ✓ {DISCOUNT_KINDS[item.kind]?.label} · {item.holderName} · ID {item.idNumber} · −{money(item.amount)}
          <span style={{ color: MUTED }}> ({item.checkMethodLabel ? `${item.checkMethodLabel}, ` : ''}checked by {item.verifiedBy})</span>
        </div>
      ))}
      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(DISCOUNT_KINDS).map(([id, kind]) => (
              <button key={id} type="button" onClick={() => { setForm(f => ({ ...f, kind: id, checkMethod: '' })); setError(''); }}
                style={{ ...btn(form.kind === id ? 'green' : 'plain'), flex: 1 }}>{kind.label}</button>
            ))}
          </div>
          <input value={form.holderName} onChange={e => set('holderName', e.target.value)} placeholder="Name on the ID" style={inp} />
          <input value={form.idNumber} onChange={e => set('idNumber', e.target.value)}
            placeholder={form.kind === 'pwd' ? 'PWD ID no. e.g. 13-7404-000-0001234' : 'OSCA / senior citizen ID no.'} style={inp} />
          {form.kind === 'senior' ? (
            <label style={small}>Birth date on the ID
              <input type="date" max={today} value={form.birthDate} onChange={e => set('birthDate', e.target.value)} style={{ ...inp, display: 'block', width: '100%', marginTop: 4 }} />
            </label>
          ) : (
            <>
              <label style={small}>Expiry date on the ID (if shown)
                <input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} style={{ ...inp, display: 'block', width: '100%', marginTop: 4 }} />
              </label>
            </>
          )}
          <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, border: `1px dashed ${BORDER}` }}>
            <span style={small}>Check that the ID is real</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {form.kind === 'pwd' && (
                <button type="button" onClick={() => openLookup(PWD_VERIFY_URL, formatPwdId(form.idNumber))} style={{ ...btn(), flex: '1 1 160px' }}>
                  <i className="ti ti-search" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Search DOH PWD registry
                </button>
              )}
              <button type="button" onClick={() => openLookup(PHILSYS_VERIFY_URL, '')} style={{ ...btn(), flex: '1 1 160px' }}>
                <i className="ti ti-id" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Check national ID (PhilSys)
              </button>
            </div>
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
              {form.kind === 'pwd'
                ? 'Opens the DOH site beside this page with the ID number copied (with dashes). Paste it (Ctrl+V) and search. "No record found" does not mean the ID is fake: many towns have not added their IDs to the DOH list yet. Then check the card, or call the town’s PDAO office.'
                : 'Senior IDs are made by each town, so there is no national list. Ask for their national ID too and check it on PhilSys; the name and birth date should match.'}
            </div>
            <select value={form.checkMethod} onChange={e => set('checkMethod', e.target.value)} style={inp} aria-label="How did you check the ID">
              <option value="">How did you check it?</option>
              {Object.entries(CHECK_METHODS)
                .filter(([id]) => form.kind === 'pwd' || id !== 'doh')
                .map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: TEXT }}>
            <input type="checkbox" checked={form.checked} onChange={e => set('checked', e.target.checked)} />
            I checked the physical ID: the photo matches the guest, and it isn't damaged or edited.
          </label>
          <div style={{ fontSize: 11.5, color: SUBTEXT }}>
            Their share is {money(preview.share)} ({totalGuests} guest{totalGuests === 1 ? '' : 's'} on this booking). VAT removed {money(preview.vatRemoved)}, 20% off {money(preview.discount20)}.
            {' '}<strong style={{ color: TEXT }}>Bill goes down by {money(preview.total)}.</strong>
          </div>
          {error && <div role="alert" style={{ fontSize: 11.5, color: RED }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setOpen(false); setForm(empty); setError(''); }} style={{ ...btn(), flex: 1 }}>Cancel</button>
            <button type="button" onClick={apply} disabled={busy} style={{ ...btn('green'), flex: 2, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Saving…' : `Apply −${money(preview.total)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
