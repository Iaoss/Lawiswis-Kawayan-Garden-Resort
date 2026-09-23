import React, { useEffect, useRef, useState } from 'react';
import { BRASS, FOREST, FOREST_DEEP, PAPER, SANS, LINE } from './clientTheme';

const logo = 'https://lawiswiskawayanresort.com/wp-content/uploads/2026/02/logo-white-new-01.png';

function NavDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = event => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(value => !value)}
        style={{ background: 'none', border: 'none', color: '#fff', font: `500 11px ${SANS}`, letterSpacing: '0.08em', cursor: 'pointer', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 5 }}
      >
        {label} <span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 14px)', left: 0, background: PAPER, borderRadius: 4, padding: '6px 0', minWidth: 220, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', zIndex: 200, border: `1px solid ${LINE}` }}>
          {items.map(item => (
            <button key={item.label} onClick={() => { window.location.href = item.path; setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 18px', border: 0, background: 'transparent', color: '#22261B', font: `12.5px ${SANS}`, cursor: 'pointer' }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientChrome({ children }) {
  const path = window.location.pathname;
  useEffect(() => {
    if (document.querySelector('link[data-lk-font]')) return;
    const font = document.createElement('link');
    font.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap';
    font.rel = 'stylesheet';
    font.dataset.lkFont = 'true';
    document.head.appendChild(font);
  }, []);
  const link = (label, href) => (
    <button key={label} onClick={() => { window.location.href = href; }} style={{ background: 'none', border: 'none', color: path === href ? '#fff' : 'rgba(255,255,255,0.68)', font: `500 11px ${SANS}`, letterSpacing: '0.08em', cursor: 'pointer', padding: '8px 0', borderBottom: path === href ? `1px solid ${BRASS}` : '1px solid transparent' }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: '#22261B', fontFamily: SANS }}>
      <div style={{ background: FOREST_DEEP, color: 'rgba(255,255,255,0.72)', padding: '7px 24px', display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', fontSize: '10px' }}>
        <span>402 Brgy. Buguion, Calumpit, Bulacan</span>
        <span>0917 811 2332 &nbsp; · &nbsp; info@lawiswiskawayanresort.com</span>
      </div>
      <header style={{ background: FOREST, minHeight: '76px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 20px rgba(35,42,27,0.16)' }}>
        <img src={logo} alt="Lawiswis Kawayan Garden Resort" onClick={() => { window.location.href = '/home'; }} style={{ width: '178px', maxWidth: '42vw', cursor: 'pointer', filter: 'brightness(0) invert(1)' }} />
        <nav style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
          {link('HOME', '/home')}
          {link('OUR AMENITIES', '/about')}
          <NavDropdown label="OUR STORY" items={[
            { label: 'About Us', path: '/about' },
            { label: 'Certifications & Awards', path: '/about' },
            { label: 'Contact Us', path: '/contact' },
          ]} />
          <NavDropdown label="OUR ROOMS" items={[
            { label: 'Regular Rooms', path: '/rooms' },
            { label: 'Suite Rooms', path: '/rooms' },
          ]} />
          <NavDropdown label="CUSTOMER CARE" items={[
            { label: 'FAQs', path: '/contact' },
            { label: 'Safety Guidelines', path: '/contact' },
            { label: 'Health and Wellness', path: '/contact' },
            { label: 'Cancellation Policy', path: '/contact' },
            { label: 'Privacy Policy', path: '/contact' },
          ]} />
        </nav>
        <button onClick={() => { window.location.href = '/rooms'; }} style={{ background: BRASS, color: '#fff', border: 0, borderRadius: '3px', padding: '11px 26px', font: `600 11.5px ${SANS}`, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>BOOK YOUR STAY</button>
      </header>
      <main>{children}</main>
      <footer style={{ background: FOREST_DEEP, color: 'rgba(255,255,255,0.64)', padding: '46px 24px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '34px' }}>
          <div><img src={logo} alt="Lawiswis Kawayan" style={{ width: '180px', filter: 'brightness(0) invert(1)', marginBottom: '16px' }} /><p style={{ maxWidth: '300px', fontSize: '12px', lineHeight: 1.8, margin: 0 }}>A quiet bamboo garden hideaway in Calumpit, Bulacan, where work and play sit comfortably side by side.</p></div>
          <div><strong style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.1em' }}>EXPLORE</strong><div style={{ display: 'grid', gap: '9px', marginTop: '14px', fontSize: '12px' }}><span onClick={() => { window.location.href = '/rooms'; }} style={{ cursor: 'pointer' }}>Our rooms</span><span onClick={() => { window.location.href = '/about'; }} style={{ cursor: 'pointer' }}>Our story</span><span onClick={() => { window.location.href = '/contact'; }} style={{ cursor: 'pointer' }}>Contact us</span></div></div>
          <div><strong style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.1em' }}>VISIT</strong><p style={{ fontSize: '12px', lineHeight: 1.8, marginTop: '14px' }}>Open daily<br />Check-in 2:00 PM<br />Check-out 12:00 NN</p></div>
        </div>
        <div style={{ maxWidth: '1100px', borderTop: `1px solid ${LINE}33`, margin: '30px auto 0', paddingTop: '18px', fontSize: '10px' }}>© 2026 Lawiswis Kawayan Garden Resort</div>
      </footer>
      <style>{`@media (max-width: 700px) { header { flex-wrap: wrap; padding: 14px 18px !important; } header nav { order: 3; width: 100%; justify-content: space-between; gap: 8px !important; } footer > div:first-child { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}