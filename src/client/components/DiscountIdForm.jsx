import React, { useState } from 'react';
import { DISCOUNT_KINDS } from '../../lib/seniorPwdDiscount';
import { getGuestIdError, MAX_ID_PHOTO_CHARS } from '../../lib/discountReview';

// Makes a phone photo small enough to send, keeping the ID readable.
export async function shrinkIdPhoto(file) {
  if (!String(file?.type || '').startsWith('image/')) throw new Error('Choose a photo of the ID (JPG or PNG).');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('This photo could not be opened. Please use a JPG or PNG.'));
      element.src = url;
    });
    for (const maxSide of [1400, 1100, 800]) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.65]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= MAX_ID_PHOTO_CHARS) return data;
      }
    }
    throw new Error('This photo is too large. Please use a smaller one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The problem with one guest's ID entry, or ''.
export function idEntryError(entry, kind, today) {
  return getGuestIdError({ ...entry, kind }, today) || (entry?.photo ? '' : 'Add a clear photo of the ID.');
}

// One card per senior citizen / PWD. Errors appear as soon as a field is left.
export default function DiscountIdForm({ kinds, entries, onChange, today, showAll, colors }) {
  const [touched, setTouched] = useState({});
  const [photoErrors, setPhotoErrors] = useState({});
  const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', background: '#fff' };
  const label = { display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#374151', minWidth: 0 };
  const update = (index, patch) => onChange(kinds.map((_, i) => (i === index ? { ...entries[i], ...patch } : entries[i] || {})));
  const choosePhoto = async (index, file) => {
    if (!file) return;
    setPhotoErrors(current => ({ ...current, [index]: '' }));
    try {
      update(index, { photo: await shrinkIdPhoto(file) });
    } catch (error) {
      update(index, { photo: '' });
      setPhotoErrors(current => ({ ...current, [index]: error.message }));
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {kinds.map((kind, index) => {
        const entry = entries[index] || {};
        const seen = showAll || touched[index];
        const problem = photoErrors[index] || (seen ? idEntryError(entry, kind, today) : '');
        const leave = () => setTouched(current => ({ ...current, [index]: true }));
        return (
          <fieldset key={`${kind}-${index}`} style={{ border: `1px solid ${colors.line}`, borderRadius: 12, padding: 14, margin: 0, minWidth: 0 }}>
            <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>{DISCOUNT_KINDS[kind].label} {kinds.length > 1 ? index + 1 : ''}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <label style={label}>Name on the ID
                <input value={entry.holderName || ''} maxLength={80} onBlur={leave} onChange={e => update(index, { holderName: e.target.value })} style={input} />
              </label>
              <label style={label}>{DISCOUNT_KINDS[kind].idLabel}
                <input value={entry.idNumber || ''} maxLength={40} onBlur={leave} onChange={e => update(index, { idNumber: e.target.value })} placeholder={kind === 'pwd' ? '13-7404-000-0001234' : ''} style={input} />
              </label>
              {kind === 'senior' ? (
                <label style={label}>Birth date
                  <input type="date" max={today} value={entry.birthDate || ''} onBlur={leave} onChange={e => update(index, { birthDate: e.target.value })} style={input} />
                </label>
              ) : (
                <label style={label}>Expiry date (if shown)
                  <input type="date" value={entry.expiryDate || ''} onBlur={leave} onChange={e => update(index, { expiryDate: e.target.value })} style={input} />
                </label>
              )}
              <label style={label}>Photo of the ID
                <input type="file" accept="image/*" onChange={e => { leave(); choosePhoto(index, e.target.files?.[0]); }} style={{ ...input, padding: 8 }} />
              </label>
            </div>
            {entry.photo && <img src={entry.photo} alt={`ID ${index + 1} preview`} style={{ display: 'block', maxWidth: 180, maxHeight: 110, marginTop: 10, borderRadius: 8, border: `1px solid ${colors.line}` }} />}
            {problem && <div role="alert" style={{ color: '#b91c1c', fontSize: 11.5, marginTop: 8 }}>{problem}</div>}
          </fieldset>
        );
      })}
    </div>
  );
}
