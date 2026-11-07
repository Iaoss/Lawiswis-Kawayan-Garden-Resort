import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { staffApi } from '../lib/staffApi';

const KEY = 'lkgr_phone_display';
const readOn = () => { try { return window.localStorage.getItem(KEY) === 'on'; } catch { return false; } };
const saveOn = on => { try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

// "Show on my phone": sends the current payment QR to this staff account's
// phone (the phone has the Phone payment screen open). While on, every new
// payment QR appears on the phone, and it clears when the QR closes here.
export default function PhoneDisplayToggle({ url, amount, guestName, sessionId, colors = {} }) {
  const { TEXT = '#1f2937', MUTED = '#6b7280', BORDER = '#e5e7eb' } = colors;
  const [on, setOn] = useState(readOn);
  const [state, setState] = useState('');
  const [setupQr, setSetupQr] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const sent = useRef('');
  const base = window.location.pathname.startsWith('/receptionist') ? '/receptionist' : '/admin';
  const phoneUrl = `${window.location.origin}${base}/phone-display`;

  const send = async next => {
    try {
      await staffApi('staff-billing', { action: 'phone-display-set', ...next });
      setState(next.url ? 'sent' : '');
    } catch (error) {
      setState(`error:${error.message || 'Could not reach your phone.'}`);
    }
  };

  // Send the QR when it appears, clear the phone when it goes away.
  useEffect(() => {
    if (!on) return;
    if (url && sent.current !== url) {
      sent.current = url;
      send({ url, amount, guestName, sessionId });
    } else if (!url && sent.current) {
      sent.current = '';
      send({ url: '' });
    }
  }, [on, url, amount, guestName, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the page clears the phone too.
  useEffect(() => () => { if (sent.current) staffApi('staff-billing', { action: 'phone-display-set', url: '' }).catch(() => {}); }, []);

  useEffect(() => {
    if (!showSetup) return undefined;
    let active = true;
    QRCode.toDataURL(phoneUrl, { width: 200, margin: 1 }).then(data => { if (active) setSetupQr(data); }).catch(() => {});
    return () => { active = false; };
  }, [showSetup, phoneUrl]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    saveOn(next);
    if (!next && sent.current) { sent.current = ''; send({ url: '' }); }
  };

  const error = state.startsWith('error:') ? state.slice(6) : '';
  return (
    <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: '8px 10px', marginTop: 8, fontSize: 11.5, color: TEXT }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
        <input type="checkbox" checked={on} onChange={toggle} />
        <i className="ti ti-device-mobile" aria-hidden="true" /> Show on my phone
        {on && url && state === 'sent' && <span style={{ color: '#16a34a', fontWeight: 600 }}>· on your phone now</span>}
      </label>
      {error && <div role="alert" style={{ color: '#dc2626', marginTop: 4 }}>{error}</div>}
      <button type="button" onClick={() => setShowSetup(v => !v)}
        style={{ border: 0, background: 'none', color: MUTED, textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: 4, fontSize: 11, fontFamily: 'inherit' }}>
        {showSetup ? 'Hide phone setup' : 'How to connect my phone'}
      </button>
      {showSetup && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          {setupQr && <img src={setupQr} alt="QR code to open the phone payment screen" width={110} height={110} style={{ background: '#fff', padding: 4, borderRadius: 6 }} />}
          <div style={{ flex: '1 1 180px', color: MUTED, lineHeight: 1.5 }}>
            1. Scan this with your phone camera (or open <strong style={{ color: TEXT, wordBreak: 'break-all' }}>{phoneUrl}</strong>).<br />
            2. Sign in with <strong style={{ color: TEXT }}>this same staff account</strong> and keep the page open.<br />
            3. Tick “Show on my phone”. Payment QRs now appear on the phone for the guest to scan.
          </div>
        </div>
      )}
    </div>
  );
}
