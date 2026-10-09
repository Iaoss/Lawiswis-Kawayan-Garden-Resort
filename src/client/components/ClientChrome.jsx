import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BRASS, FOREST, FOREST_DEEP, PAPER, SANS, LINE } from './clientTheme';
import { useResortAvailability } from './ResortAvailabilityContext';

const logo = 'https://lawiswiskawayanresort.com/wp-content/uploads/2026/02/logo-white-new-01.png';

function NavDropdown({ label, items, onNavigate, active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = event => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div ref={ref} onMouseLeave={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(value => !value)}
        className={`client-nav-link${active ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label} <span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: '100%', left: 0, background: PAPER, borderRadius: 4, padding: '6px 0', minWidth: 220, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', zIndex: 300, border: `1px solid ${LINE}` }}>
          {items.map(item => (
            <button key={item.label} onClick={() => { onNavigate(item.path); setOpen(false); }}
              className="client-dropdown-link" role="menuitem">
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientChrome({ children }) {
  const { pathname: path } = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { available: resortAvailable, error: availabilityError, loading: availabilityLoading } = useResortAvailability();
  const canBook = resortAvailable && !availabilityLoading;

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    if (document.querySelector('link[data-lk-font]')) return;
    const font = document.createElement('link');
    font.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap';
    font.rel = 'stylesheet';
    font.dataset.lkFont = 'true';
    document.head.appendChild(font);
  }, []);
  useEffect(() => setMobileMenuOpen(false), [path]);
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);
  const link = (label, href, onNavigate = () => {}) => (
    <button key={label} onClick={() => { onNavigate(); navigate(href); }} className={`client-nav-link${path === href || (href === '/home' && path === '/') || (href === '/rooms' && path.startsWith('/book/')) ? ' is-active' : ''}`} aria-current={path === href || (href === '/home' && path === '/') ? 'page' : undefined}>
      {label}
    </button>
  );
  const renderNavigation = onNavigate => (
    <>
      {link('HOME', '/home', onNavigate)}
      {link('OUR AMENITIES', '/amenities', onNavigate)}
      <NavDropdown label="OUR STORY" onNavigate={href => { onNavigate(); navigate(href); }} active={['/about-us', '/certifications'].includes(path)} items={[
        { label: 'About Us', path: '/about-us' },
        { label: 'Certifications & Awards', path: '/certifications' },
      ]} />
      <NavDropdown label="OUR ROOMS" onNavigate={href => { onNavigate(); navigate(href); }} active={path === '/rooms' || path.startsWith('/book/')} items={[
        { label: 'Regular Rooms', path: '/rooms?category=Regular%20Rooms' },
        { label: 'Suite Rooms', path: '/rooms?category=Suite%20Rooms' },
      ]} />
      <NavDropdown label="CUSTOMER CARE" onNavigate={href => { onNavigate(); navigate(href); }} active={['/contact-us', '/faqs', '/safety-guidelines', '/health-and-wellness', '/cancellation-policy', '/privacy-policy'].includes(path)} items={[
        { label: 'Contact Us', path: '/contact-us' },
        { label: 'FAQs', path: '/faqs' },
        { label: 'Safety Guidelines', path: '/safety-guidelines' },
        { label: 'Health and Wellness', path: '/health-and-wellness' },
        { label: 'Cancellation Policy', path: '/cancellation-policy' },
        { label: 'Privacy Policy', path: '/privacy-policy' },
      ]} />
      {link('MY BOOKINGS', '/my-bookings', onNavigate)}
    </>
  );

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: '#22261B', fontFamily: SANS }}>
      <div className="client-announcement-bar" style={{ position: 'relative', zIndex: 51, background: FOREST_DEEP, color: 'rgba(255,255,255,0.72)', padding: '7px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '10px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          <span><i className="ti ti-map-pin" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />402 Brgy. Buguion, Calumpit, Bulacan, PH</span>
          <span><i className="ti ti-phone" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />0917 811 2332</span>
          <span><i className="ti ti-mail" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />info@lawiswiskawayanresort.com</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '13px', alignItems: 'center' }}>
          {['ti-brand-facebook', 'ti-brand-linkedin'].map(icon => <i key={icon} className={`ti ${icon}`} style={{ cursor: 'pointer' }} />)}
        </div>
      </div>
      <header className="client-header" style={{ backgroundColor: FOREST, backgroundImage: 'none', backdropFilter: 'none', minHeight: '76px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 4px 20px rgba(35,42,27,0.16)' }}>
        <img src={logo} alt="Lawiswis Kawayan Garden Resort" onClick={() => navigate('/home')} style={{ width: '178px', maxWidth: '42vw', cursor: 'pointer', filter: 'brightness(0) invert(1)' }} />
        <nav className="client-desktop-nav" aria-label="Main navigation" style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
          {renderNavigation(() => {})}
        </nav>
        <div className="client-header-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
          <button disabled={!canBook} onClick={() => navigate('/rooms')} style={{ background: BRASS, color: '#fff', border: 0, borderRadius: '3px', padding: '11px 26px', font: `600 11.5px ${SANS}`, letterSpacing: '0.06em', cursor: canBook ? 'pointer' : 'not-allowed', opacity: canBook ? 1 : 0.65, whiteSpace: 'nowrap' }}>{canBook ? 'BOOK YOUR STAY' : availabilityLoading ? 'CHECKING AVAILABILITY' : availabilityError ? 'BOOKING STATUS UNAVAILABLE' : 'RESERVATIONS TEMPORARILY CLOSED'}</button>
        </div>
        <button className="client-mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="client-mobile-menu" onClick={() => setMobileMenuOpen(value => !value)}>
          <span aria-hidden="true">{mobileMenuOpen ? '×' : '☰'}</span>
        </button>
      </header>
      {mobileMenuOpen && (
        <div className="client-mobile-menu-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}>
          <nav id="client-mobile-menu" className="client-mobile-nav" aria-label="Mobile navigation">
            {renderNavigation(() => setMobileMenuOpen(false))}
            <button type="button" disabled={!canBook} onClick={() => { setMobileMenuOpen(false); navigate('/rooms'); }} className="client-mobile-book-button">
              {canBook ? 'BOOK YOUR STAY' : availabilityLoading ? 'CHECKING AVAILABILITY' : availabilityError ? 'BOOKING STATUS UNAVAILABLE' : 'RESERVATIONS TEMPORARILY CLOSED'}
            </button>
          </nav>
        </div>
      )}
      <main>{children}</main>
      <footer style={{ background: FOREST_DEEP, color: 'rgba(255,255,255,0.64)', padding: '46px 24px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '34px' }}>
          <div><img src={logo} alt="Lawiswis Kawayan" style={{ width: '180px', filter: 'brightness(0) invert(1)', marginBottom: '16px' }} /><p style={{ maxWidth: '300px', fontSize: '12px', lineHeight: 1.8, margin: 0 }}>A quiet bamboo garden hideaway in Calumpit, Bulacan, where work and play sit comfortably side by side.</p></div>
          <div><strong style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.1em' }}>EXPLORE</strong><div style={{ display: 'grid', gap: '9px', marginTop: '14px', fontSize: '12px' }}><span onClick={() => navigate('/rooms')} style={{ cursor: 'pointer' }}>Our rooms</span><span onClick={() => navigate('/about-us')} style={{ cursor: 'pointer' }}>Our story</span><span onClick={() => navigate('/amenities')} style={{ cursor: 'pointer' }}>Our amenities</span><span onClick={() => navigate('/contact-us')} style={{ cursor: 'pointer' }}>Contact us</span></div></div>
          <div><strong style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.1em' }}>VISIT</strong><p style={{ fontSize: '12px', lineHeight: 1.8, marginTop: '14px' }}>Open daily<br />Check-in 2:00 PM<br />Check-out 12:00 NN</p></div>
        </div>
        <div style={{ maxWidth: '1100px', borderTop: `1px solid ${LINE}33`, margin: '30px auto 0', paddingTop: '18px', fontSize: '10px' }}>© 2026 Lawiswis Kawayan Garden Resort</div>
      </footer>
      <style>{`
        .client-nav-link { background: transparent; border: 0; border-bottom: 1px solid transparent; color: rgba(255,255,255,0.76); font: 500 11px ${SANS}; letter-spacing: 0.08em; cursor: pointer; padding: 8px 0; transition: color 0.15s ease, border-color 0.15s ease; }
        .client-nav-link:hover, .client-nav-link:focus-visible, .client-nav-link.is-active { color: #fff; border-bottom-color: ${BRASS}; }
        .client-nav-link:focus-visible, .client-dropdown-link:focus-visible { outline: 2px solid ${BRASS}; outline-offset: 3px; }
        .client-dropdown-link { display: block; width: 100%; text-align: left; padding: 11px 18px; border: 0; background: transparent; color: #22261B; font: 12.5px ${SANS}; cursor: pointer; }
        .client-dropdown-link:hover { background: #F4EFE1; color: #22261B; }
        .client-header-actions { margin-left: auto; justify-content: flex-end; }
        .client-mobile-menu-toggle { display: none; border: 1px solid rgba(255,255,255,0.42); border-radius: 5px; background: transparent; color: #fff; width: 42px; height: 42px; font-size: 24px; line-height: 1; cursor: pointer; }
        .client-mobile-menu-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(10,18,12,0.62); }
        .client-mobile-nav { position: absolute; inset: 0 0 0 auto; width: min(360px, 88vw); overflow-y: auto; background: ${FOREST}; padding: 86px 24px 28px; display: flex; flex-direction: column; align-items: stretch; gap: 8px; box-shadow: -16px 0 40px rgba(0,0,0,0.25); }
        .client-mobile-nav .client-nav-link { width: 100%; text-align: left; padding: 14px 0; font-size: 13px; }
        .client-mobile-nav [role="menu"] { position: static !important; min-width: 0 !important; box-shadow: none !important; margin-bottom: 6px; }
        .client-mobile-book-button { border: 0; border-radius: 4px; padding: 14px; margin-top: 12px; background: ${BRASS}; color: #fff; font: 600 12px ${SANS}; letter-spacing: 0.06em; }
        @media (max-width: 1050px) {
          .client-header { gap: 12px !important; }
          .client-desktop-nav, .client-header-actions { display: none !important; }
          .client-mobile-menu-toggle { display: inline-grid; place-items: center; flex-shrink: 0; }
          .client-announcement-bar { padding: 7px 16px !important; }
          .client-announcement-bar > div:first-child { gap: 8px 14px !important; }
          footer > div:first-child { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}