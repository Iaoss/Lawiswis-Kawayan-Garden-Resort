import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { auth } from '../../firebase/firebase';
import { staffApi } from '../lib/staffApi';
import { checkPayMongoCheckoutStatus } from '../../lib/paymongo';
import { money } from '../lib/money';

// Staff phone as a payment screen. Sign in on the phone with the same staff
// account as the laptop and open this page. When the laptop makes a payment
// QR and "Show on my phone" is on, the QR appears here, big, for the guest
// to scan. It shows "Payment received" once the guest has paid.
export default function PhoneDisplay() {
  const [display, setDisplay] = useState({ url: '' });
  const [qr, setQr] = useState('');
  const [paid, setPaid] = useState(null); // { amount, guestName } for a few seconds
  const [error, setError] = useState('');
  const paidSession = useRef('');

  // Ask the server for the current QR every 3 seconds.
  useEffect(() => {
    let active = true;
    const load = () => staffApi('staff-billing', { action: 'phone-display-get' })
      .then(result => { if (active) { setDisplay(result || { url: '' }); setError(''); } })
      .catch(loadError => { if (active) setError(loadError.message || 'Could not reach the system.'); });
    load();
    const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!display.url) { setQr(''); return undefined; }
    let active = true;
    QRCode.toDataURL(display.url, { width: 640, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (active) setQr(url); }).catch(() => {});
    return () => { active = false; };
  }, [display.url]);

  // Watch for the guest's payment.
  useEffect(() => {
    const sessionId = display.sessionId;
    if (!display.url || !sessionId) return undefined;
    const timer = setInterval(async () => {
      try {
        const result = await checkPayMongoCheckoutStatus(sessionId);
        if (result.status === 'paid' && paidSession.current !== sessionId) {
          paidSession.current = sessionId;
          setPaid({ amount: display.amount, guestName: display.guestName });
          setTimeout(() => setPaid(null), 12000);
        }
      } catch { /* try again next time */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [display.url, display.sessionId, display.amount, display.guestName]);

  // Keep the phone screen on while this page is open (where supported).
  useEffect(() => {
    let lock = null;
    const request = () => navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    request();
    const again = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', again);
    return () => { document.removeEventListener('visibilitychange', again); lock?.release?.().catch(() => {}); };
  }, []);

  const showingPaid = paid && (!display.url || paidSession.current === display.sessionId);
  const page = { minHeight: '100vh', background: '#0f2410', color: '#fff', display: 'grid', placeItems: 'center', padding: 20, fontFamily: "'Poppins', Arial, sans-serif", textAlign: 'center' };

  if (showingPaid) {
    return (
      <main style={{ ...page, background: '#14532d' }}>
        <div>
          <div style={{ fontSize: 80, lineHeight: 1 }} aria-hidden="true">✓</div>
          <h1 style={{ fontSize: 28, margin: '16px 0 6px' }}>Payment received</h1>
          <p style={{ fontSize: 18, margin: 0 }}>{money(paid.amount)}{paid.guestName ? ` · ${paid.guestName}` : ''}</p>
          <p style={{ fontSize: 14, opacity: 0.8, marginTop: 14 }}>Thank you! Your receipt will be emailed to you.</p>
        </div>
      </main>
    );
  }

  if (!display.url) {
    return (
      <main style={page}>
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9cb56f' }}>Lawiswis Kawayan Garden Resort</div>
          <h1 style={{ fontSize: 22, margin: '14px 0 8px' }}>Phone payment screen</h1>
          <p style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.6 }}>
            Waiting for a payment QR from the system… On the laptop, make the payment QR in Billing or Walk-in with “Show on my phone” turned on.
          </p>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 18 }}>Signed in as {auth.currentUser?.email || 'staff'}. Keep this page open.</p>
          {error && <p role="alert" style={{ color: '#fca5a5', fontSize: 12 }}>{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main style={{ ...page, background: '#ffffff', color: '#1f2937' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#1a3a1a', fontWeight: 700 }}>Lawiswis Kawayan Garden Resort</div>
        <h1 style={{ fontSize: 22, margin: '10px 0 2px' }}>Scan to pay {money(display.amount)}</h1>
        {display.guestName && <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>{display.guestName}</p>}
        {qr
          ? <img src={qr} alt="Payment QR code" style={{ width: '100%', maxWidth: 360, height: 'auto', margin: '18px auto', display: 'block' }} />
          : <p style={{ margin: 40 }}>Loading the QR…</p>}
        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>Open your phone camera, GCash, Maya or bank app and scan this code. You can pay by QR Ph, GCash, Maya, GrabPay or card.</p>
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 12 }}>This screen updates by itself when the payment goes through.</p>
      </div>
    </main>
  );
}
