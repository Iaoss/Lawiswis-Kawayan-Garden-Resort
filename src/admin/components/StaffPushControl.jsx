import React, { useEffect, useState } from 'react';
import { auth } from '../../firebase/firebase';
import { registerStaffPush } from '../lib/staffPush';

export default function StaffPushControl({ dark = false }) {
  const [enabled, setEnabled] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !auth.currentUser || !process.env.REACT_APP_FIREBASE_VAPID_KEY) return;
    registerStaffPush().catch(loadError => {
      console.error('Staff phone alerts could not register:', loadError);
      setError(loadError.message || 'Phone alerts could not be enabled.');
    });
  }, [enabled]);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await registerStaffPush();
      setEnabled(true);
    } catch (enableError) {
      console.error('Staff phone alerts could not be enabled:', enableError);
      setError(enableError.message || 'Phone alerts could not be enabled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: 'inline-grid', gap: 3 }}>
      <button type="button" onClick={enable} disabled={busy || enabled}
        style={{ border: `1px solid ${dark ? '#44463f' : '#dfe3dd'}`, borderRadius: 9, padding: '7px 10px', background: dark ? '#282827' : '#fff', color: dark ? '#e8e8d8' : '#273128', font: 'inherit', fontSize: 11, fontWeight: 600, cursor: busy || enabled ? 'default' : 'pointer' }}>
        {busy ? 'Enabling…' : enabled ? 'Phone alerts on' : 'Enable phone alerts'}
      </button>
      {error && <span role="alert" style={{ maxWidth: 200, color: '#b42318', fontSize: 10 }}>{error}</span>}
    </span>
  );
}
