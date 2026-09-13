import React from 'react';
import { Outlet } from 'react-router-dom';
import ChatWidget from './ChatWidget';

const ACCENT = '#d4f550';
const DARK = '#1a2420';

export default function ClientLayout({ children }) {
  const nav = [
    { label: 'Home', path: '/home' },
    { label: 'Rooms', path: '/rooms' },
    { label: 'About', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ];

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", minHeight: '100vh', background: '#f9fafb' }}>
      {/* Navbar */}
      <nav style={{ background: DARK, padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>
          <div style={{ width: '34px', height: '34px', background: ACCENT, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '16px', color: '#111' }}>H</div>
          <div>
            <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px', lineHeight: 1 }}>HuaPro</div>
            <div style={{ color: ACCENT, fontSize: '9px' }}>Resort & Hotel</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '30px' }}>
          {nav.map(n => (
            <button key={n.label} onClick={() => window.location.href = n.path}
              style={{ background: 'none', border: 'none', color: window.location.pathname === n.path ? ACCENT : '#ccc', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              {n.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => window.location.href = '/rooms'}
            style={{ background: ACCENT, border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: '#111' }}>
            Book Now
          </button>
        </div>
      </nav>

      {/* Content */}
      <div><Outlet /></div>

      <ChatWidget />

      {/* Footer */}
      <footer style={{ background: DARK, color: '#9ca3af', padding: '40px', marginTop: '60px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '32px', height: '32px', background: ACCENT, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: '#111' }}>H</div>
              <span style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>HuaPro</span>
            </div>
            <p style={{ fontSize: '12px', lineHeight: '1.8' }}>Your perfect resort getaway. Experience luxury, comfort, and world-class hospitality.</p>
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: '600', fontSize: '13px', marginBottom: '12px' }}>Quick Links</div>
            {['Home', 'Rooms', 'About', 'Contact'].map(l => (
              <div key={l} style={{ fontSize: '12px', marginBottom: '6px', cursor: 'pointer' }}>{l}</div>
            ))}
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: '600', fontSize: '13px', marginBottom: '12px' }}>Contact Us</div>
            <div style={{ fontSize: '12px', lineHeight: '2' }}>
              <div>📍 Angeles City, Pampanga</div>
              <div>📞 +63 XXX XXX XXXX</div>
              <div>✉️ info@huapro.com</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #2a3d35', marginTop: '30px', paddingTop: '20px', textAlign: 'center', fontSize: '11px' }}>
          © 2026 HuaPro Resort. All rights reserved.
        </div>
      </footer>
    </div>
  );
}