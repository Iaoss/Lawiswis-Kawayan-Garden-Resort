import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/firebase';
import { useSettings } from './SettingsContext';
import logo from './logo-mark.png';

export default function HousekeeperLayout({ children }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [error, setError] = useState('');
  const dark = Boolean(settings?.darkMode);
  const background = dark ? '#020b09' : '#f4f6f4';
  const surface = dark ? '#1c1c1c' : '#fff';
  const text = dark ? '#e8e8d8' : '#1f2937';

  const handleSignOut = async () => {
    setError('');
    try {
      await signOut(auth);
      navigate('/admin/login', { replace: true });
    } catch (signOutError) {
      console.error('Housekeeper sign-out failed:', signOutError);
      setError('Could not sign out. Please try again.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background, color: text, fontFamily: "'Poppins', sans-serif" }}>
      <header style={{ minHeight: 62, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: surface, borderBottom: `1px solid ${dark ? '#282827' : '#e5e7eb'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src={logo} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>Lawiswis Kawayan</div>
            <div style={{ color: dark ? '#a3a393' : '#6b7280', fontSize: 10 }}>Housekeeping</div>
          </div>
        </div>
        <button type="button" onClick={handleSignOut} style={{ minHeight: 38, padding: '0 12px', border: `1px solid ${dark ? '#44463f' : '#e5e7eb'}`, borderRadius: 9, background: surface, color: text, font: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Sign out
        </button>
      </header>
      {error && <div role="alert" style={{ padding: '8px 18px', color: '#b42318', background: dark ? '#351d1b' : '#fef2f2', fontSize: 12 }}>{error}</div>}
      {children}
    </div>
  );
}
