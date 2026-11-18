import React, { useEffect, useState } from 'react';
import { staffApi } from '../lib/staffApi';
import { CHECK_METHODS, DISCOUNT_KINDS, PHILSYS_VERIFY_URL, PWD_VERIFY_URL } from '../../lib/seniorPwdDiscount';

// Staff review of the Senior / PWD IDs a guest sent with an online booking.
// Approving applies the discounts and gives the guest a payment link; the ID
// photos are deleted once a decision is made.
export default function DiscountReviewDialog({ reservation, colors: c, onClose, onDone }) {
  const [ids, setIds] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkMethod, setCheckMethod] = useState('');
  const [checked, setChecked] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    staffApi('discount-review', { action: 'view', reservationId: reservation.id })
      .then(data => { if (active) setIds(data.ids || []); })
      .catch(loadError => { if (active) { setIds([]); setError(loadError.message); } });
    return () => { active = false; };
  }, [reservation.id]);

  const decide = async action => {
    setBusy(true);
    setError('');
    try {
      const data = await staffApi('discount-review', action === 'approve'
        ? { action, reservationId: reservation.id, checkMethod, checked }
        : { action, reservationId: reservation.id, reason });
      setResult(data);
      onDone?.(data);
    } catch (decisionError) {
      setError(decisionError.message);
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(result.paymentUrl);
      setCopied(true);
    } catch { setError('Copy the link from the box below.'); }
  };

  const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${c.BORDER2}`, borderRadius: 8, padding: '9px 10px', background: c.CARD2, color: c.TEXT, fontFamily: 'inherit', fontSize: 12.5 };
  const button = { border: `1px solid ${c.BORDER2}`, borderRadius: 8, padding: '9px 14px', background: c.CARD2, color: c.TEXT, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 };
  const primary = { ...button, border: 0, background: c.ACCENT, color: c.ACCENT_TEXT, fontWeight: 700 };
  const contact = result?.contact || {};
  const contactText = contact.method === 'Facebook Messenger' ? `Facebook: ${contact.link}` : contact.method === 'Phone' ? `Phone: ${contact.phone}` : contact.email ? `Email: ${contact.email}` : contact.phone ? `Phone: ${contact.phone}` : '';

  return (
    <div role="presentation" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="discount-review-title"
        style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', background: c.CARD, border: `1px solid ${c.BORDER}`, borderRadius: 16, padding: 20, display: 'grid', gap: 14 }}>
        <div>
          <h2 id="discount-review-title" style={{ margin: 0, fontSize: 17, color: c.TEXT }}>Check Senior / PWD IDs</h2>
          <div style={{ fontSize: 12, color: c.MUTED }}>{reservation.guestName} · Room {reservation.roomNumber} · #{reservation.id.slice(0, 8).toUpperCase()}</div>
        </div>

        {result ? (
          <div style={{ display: 'grid', gap: 10, fontSize: 13, color: c.TEXT }}>
            <strong>{result.status === 'approved' ? 'ID approved. The discount is applied.' : 'ID rejected. No discount was applied.'}</strong>
            <div>Amount to pay: <strong>₱{Number(result.amount).toLocaleString()}</strong></div>
            <div style={{ color: result.emailed ? '#15803d' : '#b45309', fontWeight: 600 }}>
              {result.emailed ? `The guest was emailed the result and payment link (${contact.email}).` : result.emailError || 'This guest has no email address. Please send them the link yourself.'}
            </div>
            {!result.emailed && contactText && <div>Contact the guest: <strong style={{ overflowWrap: 'anywhere' }}>{contactText}</strong></div>}
            <input readOnly aria-label="Payment link" value={result.paymentUrl} onFocus={event => event.target.select()} style={input} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={copyLink} style={button}>{copied ? 'Copied' : 'Copy payment link'}</button>
              <button type="button" onClick={onClose} style={primary}>Done</button>
            </div>
          </div>
        ) : ids === null ? (
          <div role="status" style={{ fontSize: 13, color: c.MUTED }}>Loading the IDs…</div>
        ) : (
          <>
            {ids.map(id => (
              <article key={id.index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, background: c.CARD2, border: `1px solid ${c.BORDER2}`, borderRadius: 12, padding: 12 }}>
                <a href={id.photo} target="_blank" rel="noopener noreferrer" title="Open the full photo" download={`id-${id.index + 1}.jpg`}>
                  <img src={id.photo} alt={`ID of ${id.holderName}`} style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'contain', background: '#000', borderRadius: 8 }} />
                </a>
                <dl style={{ margin: 0, display: 'grid', gap: 6, fontSize: 12.5, color: c.TEXT }}>
                  {[['Type', DISCOUNT_KINDS[id.kind]?.label], ['Name', id.holderName], ['ID number', id.idNumber],
                    ...(id.birthDate ? [['Birth date', id.birthDate]] : []), ...(id.expiryDate ? [['Expiry', id.expiryDate]] : [])].map(([term, value]) => (
                    <div key={term}><dt style={{ fontSize: 10.5, color: c.MUTED }}>{term}</dt><dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</dd></div>
                  ))}
                </dl>
              </article>
            ))}
            <div style={{ fontSize: 11.5, color: c.MUTED }}>
              Verify on the <a href={PWD_VERIFY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>DOH PWD registry</a> or <a href={PHILSYS_VERIFY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>PhilSys</a>. The ID photos are deleted once you decide.
            </div>
            {rejecting ? (
              <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600, color: c.TEXT }}>Reason sent to the guest
                <input value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder="e.g. The photo is not readable" style={input} />
              </label>
            ) : (
              <>
                <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600, color: c.TEXT }}>How did you check the ID?
                  <select value={checkMethod} onChange={event => setCheckMethod(event.target.value)} style={input}>
                    <option value="">Choose…</option>
                    {Object.entries(CHECK_METHODS).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', gap: 8, fontSize: 12.5, color: c.TEXT }}>
                  <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />
                  I checked each ID. The details match the photo. The guest must still show the ID on arrival.
                </label>
              </>
            )}
            {error && <div role="alert" style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={onClose} style={button}>Close</button>
              {rejecting ? (
                <>
                  <button type="button" disabled={busy} onClick={() => setRejecting(false)} style={button}>Back</button>
                  <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => decide('reject')} style={{ ...primary, background: '#dc2626', color: '#fff', opacity: reason.trim().length < 3 ? 0.55 : 1 }}>{busy ? 'Saving…' : 'Reject and notify'}</button>
                </>
              ) : (
                <>
                  <button type="button" disabled={busy || !ids.length} onClick={() => setRejecting(true)} style={{ ...button, color: '#dc2626' }}>Reject</button>
                  <button type="button" disabled={busy || !checked || !checkMethod || !ids.length} onClick={() => decide('approve')} style={{ ...primary, opacity: !checked || !checkMethod ? 0.55 : 1 }}>{busy ? 'Saving…' : 'Approve and notify'}</button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
