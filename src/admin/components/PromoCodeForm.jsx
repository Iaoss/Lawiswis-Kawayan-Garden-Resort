import React, { useState } from 'react';
import { staffApi } from '../lib/staffApi';
import { money } from '../lib/money';

// "Promo code" box for staff (Billing and Walk-In). The server checks the
// code and works out the discount from the booking's own total; this box
// only sends the code. One promo per booking.
export default function PromoCodeForm({ reservation, colors, inp, btn, onApplied }) {
  const { TEXT, SUBTEXT, MUTED, BORDER, RED = '#dc2626' } = colors;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const small = { fontSize: 11, fontWeight: 600, color: SUBTEXT };
  const blocked = ['cancelled', 'checked-out'].includes(reservation.status);

  const apply = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 3) { setError('Enter the promo code.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await staffApi('staff-billing', { action: 'apply-promo', reservationId: reservation.id, code: clean });
      setCode('');
      setOpen(false);
      onApplied?.(result);
    } catch (applyError) {
      setError(applyError.message || 'The promo code could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 10, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={small}>Promo code</span>
        {!open && !reservation.promoCode && !blocked && (
          <button type="button" onClick={() => setOpen(true)} style={btn()}>Add promo</button>
        )}
      </div>
      {reservation.promoCode && (
        <div style={{ fontSize: 11.5, color: TEXT, marginTop: 6 }}>
          ✓ {reservation.promoCode} · −{money(reservation.promoDiscount || 0)}
          {reservation.promoAppliedByName && <span style={{ color: MUTED }}> (added by {reservation.promoAppliedByName})</span>}
        </div>
      )}
      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <input
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
            placeholder="e.g. SUMMER10"
            aria-label="Promo code"
            maxLength={32}
            style={{ ...inp, textTransform: 'uppercase', letterSpacing: '0.04em' }}
          />
          <div style={{ fontSize: 11, color: MUTED }}>
            The code's own rules apply (dates, minimum spend, usage limit). Add the promo before any Senior / PWD discount.
          </div>
          {error && <div role="alert" style={{ fontSize: 11.5, color: RED }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setOpen(false); setCode(''); setError(''); }} style={{ ...btn(), flex: 1 }}>Cancel</button>
            <button type="button" onClick={apply} disabled={busy} style={{ ...btn('green'), flex: 2, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Checking…' : 'Apply promo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
