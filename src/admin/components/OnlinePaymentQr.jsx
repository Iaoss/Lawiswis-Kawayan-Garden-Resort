import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { checkPayMongoCheckoutStatus, createPayMongoCheckout } from '../../lib/paymongo';
import { money } from '../lib/money';

// "Pay online" box for staff screens: makes a PayMongo link for the amount,
// shows it as a QR the guest scans with their phone, and notices by itself
// when the guest has paid (checks every 8 seconds).
export default function OnlinePaymentQr({ reservationId, amount, onPaid, colors }) {
  const { CARD2, BORDER, TEXT, MUTED, SUBTEXT = MUTED, ACCENT = '#9cb56f', ACCENT_TEXT = '#0a1a0a' } = colors || {};
  const [link, setLink] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ error: '', status: '', copied: false });
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const makeLink = async () => {
    if (!(Number(amount) > 0)) return;
    setBusy(true);
    setState({ error: '', status: '', copied: false });
    try {
      const result = await createPayMongoCheckout({ reservationId, amount: Number(amount) });
      setLink(result.checkoutUrl);
      setSessionId(result.checkoutSessionId || '');
    } catch (error) {
      setState(s => ({ ...s, error: error.message || 'Could not make the payment link.' }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!link) { setQr(''); return undefined; }
    let active = true;
    QRCode.toDataURL(link, { width: 240, margin: 1 }).then(url => { if (active) setQr(url); }).catch(() => {});
    return () => { active = false; };
  }, [link]);

  const check = async (quiet) => {
    if (!sessionId) return;
    try {
      const result = await checkPayMongoCheckoutStatus(sessionId);
      if (result.status === 'paid') {
        setLink(''); setSessionId('');
        onPaidRef.current?.(result);
      } else if (!quiet || result.status === 'expired') {
        setState(s => ({ ...s, status: result.status }));
      }
    } catch (error) {
      if (!quiet) setState(s => ({ ...s, error: error.message || 'Could not reach PayMongo.' }));
    }
  };

  useEffect(() => {
    if (!sessionId) return undefined;
    const timer = setInterval(() => check(true), 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setState(s => ({ ...s, copied: true })); } catch { /* clipboard blocked */ }
  };

  const btn = { border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT, borderRadius: 9, padding: '9px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}><i className="ti ti-qrcode" aria-hidden="true" /> Pay online (scan the QR)</div>
      <div style={{ fontSize: 11, color: MUTED, margin: '2px 0 10px' }}>The guest pays on their own phone by QR Ph, GCash, Maya, GrabPay or card.</div>
      {!link ? (
        <button type="button" onClick={makeLink} disabled={busy || !(Number(amount) > 0)}
          style={{ ...btn, width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 0, padding: 12, fontSize: 13, fontWeight: 700, opacity: busy || !(Number(amount) > 0) ? 0.6 : 1 }}>
          {busy ? 'Making the QR…' : `Show QR to pay ${money(amount)} online`}
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {qr && (
            <div style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: 12, background: '#fff', borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <img src={qr} alt="QR code of the payment link" width={200} height={200} />
              <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, textAlign: 'center' }}>Guest: scan with your phone camera to pay {money(amount)}</div>
              <div style={{ fontSize: 10.5, color: '#6b7280' }}>Waiting for payment… this updates by itself.</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input readOnly value={link} onFocus={e => e.target.select()} aria-label="Payment link"
              style={{ flex: 1, minWidth: 0, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '8px 10px', fontSize: 11, color: SUBTEXT, background: 'transparent' }} />
            <button type="button" onClick={copy} style={btn}>{state.copied ? 'Copied' : 'Copy link'}</button>
          </div>
          <button type="button" onClick={() => check(false)} style={btn}>Has the guest paid?</button>
          {state.status === 'unpaid' && <div style={{ fontSize: 11, color: SUBTEXT }}>Not paid yet.</div>}
          {state.status === 'expired' && <div style={{ fontSize: 11, color: '#dc2626' }}>This link expired. <button type="button" onClick={() => { setLink(''); setSessionId(''); }} style={{ ...btn, padding: '2px 8px' }}>Make a new one</button></div>}
        </div>
      )}
      {state.error && <div role="alert" style={{ marginTop: 8, fontSize: 11.5, color: '#dc2626' }}>{state.error}</div>}
    </div>
  );
}
