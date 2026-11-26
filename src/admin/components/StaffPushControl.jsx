import React, { useEffect, useState } from 'react';
import { auth } from '../../firebase/firebase';
import { getStaffPushEnabled, registerStaffPush, unregisterStaffPush } from '../lib/staffPush';

export default function StaffPushControl({ dark = false }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getStaffPushEnabled()
      .then(isEnabled => {
        if (active) setEnabled(isEnabled);
      })
      .catch(loadError => {
        console.error('Staff phone alert status could not be loaded:', loadError);
        if (active) setError(loadError.message || 'Phone alert status could not be loaded.');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  const toggle = async () => {
    if (busy || !ready || !auth.currentUser) return;
    setBusy(true);
    setError('');
    try {
      if (enabled) {
        await unregisterStaffPush();
        setEnabled(false);
      } else {
        await registerStaffPush();
        setEnabled(true);
      }
    } catch (toggleError) {
      console.error('Staff phone alerts could not be updated:', toggleError);
      setError(toggleError.message || 'Phone alerts could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const muted = dark ? '#a3a393' : '#687160';
  return (
    <span style={{ display: 'inline-grid', justifyItems: 'start', gap: 3 }}>
      <button
        type="button"
        role="switch"
        aria-label="Phone alerts"
        aria-checked={enabled}
        onClick={toggle}
        disabled={busy || !ready}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 36,
          padding: '6px 9px',
          border: `1px solid ${dark ? '#44463f' : '#dfe3dd'}`,
          borderRadius: 999,
          background: dark ? '#282827' : '#fff',
          color: dark ? '#e8e8d8' : '#273128',
          font: 'inherit',
          fontSize: 11,
          fontWeight: 600,
          cursor: busy || !ready ? 'wait' : 'pointer',
        }}
      >
        <span>{busy ? 'Updating…' : enabled ? 'Alerts on' : ready ? 'Alerts off' : 'Checking…'}</span>
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            width: 30,
            height: 17,
            borderRadius: 999,
            background: enabled ? '#4b8d3c' : dark ? '#55584e' : '#c7ccc4',
            transition: 'background 120ms ease',
          }}
        >
          <span style={{
            position: 'absolute',
            top: 2,
            left: enabled ? 15 : 2,
            width: 13,
            height: 13,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 120ms ease',
          }} />
        </span>
      </button>
      {error && <span role="alert" style={{ maxWidth: 210, color: '#b42318', fontSize: 10 }}>{error}</span>}
      {!error && enabled && <span style={{ color: muted, fontSize: 9 }}>This device</span>}
    </span>
  );
}
