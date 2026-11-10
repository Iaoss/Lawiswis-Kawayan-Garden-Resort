import React, { useState } from 'react';
import { staffApi } from '../lib/staffApi';
import {
  CORPORATE_FEATURE_ROWS, MAX_GROUP_GUESTS, MIN_GROUP_GUESTS,
  getCorporateNights, getCorporatePackage, getGroupGuestError, isCorporateFeatureIncluded,
} from '../../lib/corporatePackages';
import { PREFERRED_CONTACT_METHODS } from '../../lib/preferredContactMethods';
import { NAME_PATTERN } from '../../lib/nameValidation';

const empty = {
  companyName: '', firstName: '', lastName: '', email: '', phone: '', preferredContactMethod: '', contactLink: '',
  totalGuests: MIN_GROUP_GUESTS, bookingType: 'overnight', checkIn: '', checkOut: '', notes: '',
};

// Walk-in → Corporate / group. A company representative books at the desk.
// No 7-day notice: if the resort is free, the group can be booked right away.
export default function CorporateWalkInForm({ colors, inp, label, today, onCreated }) {
  const { CARD, BORDER, TEXT, MUTED, ACCENT, ACCENT_TEXT, CARD2 } = colors;
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError(''); };
  const isTour = form.bookingType === 'daytour';
  const checkOut = isTour ? form.checkIn : form.checkOut;
  const guests = Math.floor(Number(form.totalGuests) || 0);
  const nights = form.checkIn && checkOut ? getCorporateNights(form.bookingType, form.checkIn, checkOut) : 0;
  const pkg = getCorporatePackage(guests, Math.max(1, nights));
  const inclusions = pkg ? CORPORATE_FEATURE_ROWS.filter(row => isCorporateFeatureIncluded(pkg.id, Math.max(1, nights), row.id)) : [];

  const submit = async event => {
    event.preventDefault();
    const guestError = getGroupGuestError(guests);
    if (guestError) { setError(guestError); return; }
    if (!form.companyName.trim()) { setError('Enter the company or group name.'); return; }
    if (!NAME_PATTERN.test(form.firstName.trim()) || !NAME_PATTERN.test(form.lastName.trim())) { setError('Enter the contact person’s first and last name.'); return; }
    if (!form.checkIn || (!isTour && !form.checkOut) || nights < 1) { setError(isTour ? 'Choose the event date.' : 'Choose a check-out date after check-in.'); return; }
    setBusy(true);
    try {
      const result = await staffApi('staff-billing', {
        action: 'create-corporate-walk-in',
        booking: {
          companyName: form.companyName.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(),
          email: form.email.trim(), phone: form.phone.trim(), preferredContactMethod: form.preferredContactMethod,
          contactLink: form.contactLink.trim(), totalGuests: guests, bookingType: form.bookingType,
          checkIn: form.checkIn, checkOut, notes: form.notes,
        },
      });
      onCreated({ ...result, form: { ...form, checkOut, totalGuests: guests }, nights: Math.max(1, nights), packageId: pkg?.id });
      setForm(empty);
    } catch (submitError) {
      setError(submitError.message || 'The group booking could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const field = (key, text, props = {}) => (
    <div>
      <label style={label}>{text}</label>
      <input value={form[key]} onChange={e => set(key, e.target.value)} style={inp} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 460px', minWidth: 0, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Corporate / group booking</div>
        <div style={{ fontSize: 11.5, color: MUTED, margin: '2px 0 14px' }}>
          For a company representative booking at the desk ({MIN_GROUP_GUESTS}–{MAX_GROUP_GUESTS} guests). It can be for today or any later date. After saving, take the payment and assign rooms.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {field('companyName', 'Company / group', { maxLength: 120, required: true })}
          {field('totalGuests', 'Number of guests', { type: 'number', min: MIN_GROUP_GUESTS, max: MAX_GROUP_GUESTS, required: true })}
          {field('firstName', 'Contact first name', { maxLength: 35, required: true })}
          {field('lastName', 'Contact last name', { maxLength: 35, required: true })}
          {field('phone', 'Mobile number', { inputMode: 'numeric', maxLength: 11, placeholder: '09XXXXXXXXX', required: true })}
          {field('email', 'Email', { type: 'email', maxLength: 254, required: true })}
          <div>
            <label style={label}>Preferred contact</label>
            <select value={form.preferredContactMethod} onChange={e => set('preferredContactMethod', e.target.value)} style={inp} required>
              <option value="">Choose…</option>
              {PREFERRED_CONTACT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
            </select>
          </div>
          {form.preferredContactMethod === 'Facebook Messenger' && field('contactLink', 'Facebook profile link', { required: true })}
          <div>
            <label style={label}>Booking type</label>
            <select value={form.bookingType} onChange={e => set('bookingType', e.target.value)} style={inp}>
              <option value="overnight">Overnight stay</option>
              <option value="daytour">Day event (one day)</option>
            </select>
          </div>
          {field('checkIn', isTour ? 'Event date' : 'Check-in', { type: 'date', min: today, required: true })}
          {!isTour && field('checkOut', 'Check-out', { type: 'date', min: form.checkIn || today, required: true })}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={label}>Notes (optional)</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} maxLength={1000} rows={3} style={{ ...inp, resize: 'vertical' }} />
        </div>
        {error && <div role="alert" style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>}
      </div>

      <aside style={{ flex: '0 0 300px', maxWidth: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Package</div>
        {pkg ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, marginTop: 6 }}>{pkg.name}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{guests} guests × ₱{pkg.ratePerGuest.toLocaleString()}{nights > 1 ? ` × ${nights} nights` : ''}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT, margin: '8px 0' }}>₱{pkg.totalAmount.toLocaleString()}</div>
            <div style={{ background: CARD2, borderRadius: 10, padding: 10, fontSize: 11.5, color: TEXT }}>
              {inclusions.map(row => <div key={row.id}>✓ {row.label}</div>)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Enter {MIN_GROUP_GUESTS}–{MAX_GROUP_GUESTS} guests to see the package.</div>
        )}
        <button type="submit" disabled={busy || !pkg}
          style={{ width: '100%', marginTop: 14, background: ACCENT, color: ACCENT_TEXT, border: 0, borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy || !pkg ? 0.6 : 1, fontFamily: 'inherit' }}>
          {busy ? 'Saving…' : 'Create group booking →'}
        </button>
      </aside>
    </form>
  );
}
