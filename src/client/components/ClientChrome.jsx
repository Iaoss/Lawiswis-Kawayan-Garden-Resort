import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BRASS, FOREST_DEEP, PAPER, SANS, LINE } from './clientTheme';
import { useResortAvailability } from './ResortAvailabilityContext';
import { BookingTypeSelectionModal } from '../pages/BookingTypeSelection';
import { BOOKING_TYPE_MODAL_EVENT } from '../lib/bookingTypeModal';

const logo = 'https://lawiswiskawayanresort.com/wp-content/uploads/2026/02/logo-white-new-01.png';
// Floating pill navbar colours.
const NAV_BG = '#101a14';
const NAV_CTA = '#FDF1B8';

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
    <div ref={ref} onMouseEnter={() => { if (window.matchMedia('(hover: hover)').matches) setOpen(true); }} onMouseLeave={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(value => !value)}
        className={`client-nav-link${active ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label} <span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        // The outer box starts right under the button and its top padding
        // bridges the gap, so moving the mouse down to the menu keeps it open.
        <div className="client-dropdown-bridge" style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', paddingTop: 10, zIndex: 300 }}>
          <div role="menu" className="client-dropdown client-glass" style={{ borderRadius: 18, padding: 6, minWidth: 220 }}>
            {items.map(item => (
              <button key={item.label} onClick={() => { onNavigate(item.path); setOpen(false); }}
                className="client-dropdown-link" role="menuitem">
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientChrome({ children }) {
  const { pathname: path } = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const { available: resortAvailable, error: availabilityError, loading: availabilityLoading } = useResortAvailability();
  const canBook = resortAvailable && !availabilityLoading;
  const openBookingModal = () => {
    if (!canBook) return;
    setBookingModalOpen(true);
  };

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    // Fonts are loaded once in public/index.html.
  }, []);
  useEffect(() => setMobileMenuOpen(false), [path]);
  const overHero = path === '/' || path === '/home';
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);
  useEffect(() => {
    const handleOpen = () => {
      if (!canBook) return;
      setBookingModalOpen(true);
    };
    window.addEventListener(BOOKING_TYPE_MODAL_EVENT, handleOpen);
    return () => window.removeEventListener(BOOKING_TYPE_MODAL_EVENT, handleOpen);
  }, [canBook]);
  useEffect(() => {
    if (!bookingModalOpen) return undefined;
    const onEscape = event => {
      if (event.key === 'Escape') setBookingModalOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [bookingModalOpen]);
  const link = (label, href, onNavigate = () => {}) => (
    <button key={label} onClick={() => { onNavigate(); navigate(href); }} className={`client-nav-link${path === href || (href === '/home' && path === '/') || (href === '/rooms' && path.startsWith('/book/')) ? ' is-active' : ''}`} aria-current={path === href || (href === '/home' && path === '/') ? 'page' : undefined}>
      {label}
    </button>
  );
  const renderNavigation = onNavigate => (
    <>
      {link('Home', '/home', onNavigate)}
      {link('Amenities', '/amenities', onNavigate)}
      <NavDropdown label="Our story" onNavigate={href => { onNavigate(); navigate(href); }} active={['/about-us', '/certifications'].includes(path)} items={[
        { label: 'About Us', path: '/about-us' },
        { label: 'Certifications & Awards', path: '/certifications' },
      ]} />
      <NavDropdown label="Rooms" onNavigate={href => { onNavigate(); navigate(href); }} active={path === '/rooms' || path.startsWith('/book/')} items={[
        { label: 'Regular Rooms', path: '/rooms?category=Regular%20Rooms' },
        { label: 'Suite Rooms', path: '/rooms?category=Suite%20Rooms' },
      ]} />
      <NavDropdown label="Customer care" onNavigate={href => { onNavigate(); navigate(href); }} active={['/contact-us', '/faqs', '/safety-guidelines', '/health-and-wellness', '/cancellation-policy', '/privacy-policy', '/terms-of-service'].includes(path)} items={[
        { label: 'Contact Us', path: '/contact-us' },
        { label: 'FAQs', path: '/faqs' },
        { label: 'Safety Guidelines', path: '/safety-guidelines' },
        { label: 'Health and Wellness', path: '/health-and-wellness' },
        { label: 'Cancellation & Refund Policy', path: '/cancellation-policy' },
        { label: 'Privacy Policy', path: '/privacy-policy' },
        { label: 'Terms of Service', path: '/terms-of-service' },
      ]} />
      {link('My bookings', '/my-bookings', onNavigate)}
    </>
  );

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: '#22261B', fontFamily: SANS }}>
      <div className="client-announcement-bar" style={{ position: 'relative', zIndex: 51, background: FOREST_DEEP, color: 'rgba(255,255,255,0.72)', padding: '7px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '10px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          <span><i className="ti ti-map-pin" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />402 Brgy. Buguion, Calumpit, Bulacan, PH</span>
          <span><i className="ti ti-phone" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />0917 811 2332</span>
          <span><i className="ti ti-mail" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />lawiswiskawayyyan123@gmail.com</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '13px', alignItems: 'center' }}>
          <a href="https://www.facebook.com/search/top?q=lawiswis%20kawayan%20garden%20resort" target="_blank" rel="noopener noreferrer" aria-label="Facebook" style={{ color: 'inherit' }}><i className="ti ti-brand-facebook" /></a>
        </div>
      </div>
      {/* Floating pill navbar. On the home page it floats over the photo
          slider; elsewhere it sits at the top. It stays in view when scrolling. */}
      <div className={`client-header-wrap${overHero ? ' is-over-hero' : ''}`}>
        <header className={`client-header client-glass${scrolled ? ' is-scrolled' : ''}`}>
          <img src={logo} alt="Lawiswis Kawayan Garden Resort" onClick={() => navigate('/home')} className="client-header-logo" />
          <nav className="client-desktop-nav" aria-label="Main navigation">
            {renderNavigation(() => {})}
          </nav>
          <button type="button" disabled={!canBook} onClick={openBookingModal} className="client-header-cta">
            {canBook ? 'BOOK NOW' : availabilityLoading ? 'CHECKING…' : availabilityError ? 'UNAVAILABLE' : 'CLOSED'}
          </button>
          <button className="client-mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="client-mobile-menu" onClick={() => setMobileMenuOpen(value => !value)}>
            <span aria-hidden="true">{mobileMenuOpen ? '×' : '☰'}</span>
          </button>
        </header>
      </div>
      {mobileMenuOpen && (
        <div className="client-mobile-menu-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}>
          <nav id="client-mobile-menu" className="client-mobile-nav" aria-label="Mobile navigation">
            {renderNavigation(() => setMobileMenuOpen(false))}
            <button type="button" disabled={!canBook} onClick={() => { setMobileMenuOpen(false); openBookingModal(); }} className="client-mobile-book-button">
              {canBook ? 'BOOK YOUR STAY' : availabilityLoading ? 'CHECKING AVAILABILITY' : availabilityError ? 'BOOKING STATUS UNAVAILABLE' : 'RESERVATIONS TEMPORARILY CLOSED'}
            </button>
          </nav>
        </div>
      )}
      <BookingTypeSelectionModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        onSelectPersonal={() => {
          setBookingModalOpen(false);
          navigate('/rooms');
        }}
        onSelectCorporate={() => {
          setBookingModalOpen(false);
          navigate('/corporate-booking');
        }}
      />
      <main className="client-main">{children}</main>
      <footer style={{ background: FOREST_DEEP, color: 'rgba(255,255,255,0.64)', padding: '46px 24px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '34px' }}>
          <div><img src={logo} alt="Lawiswis Kawayan" style={{ width: '180px', filter: 'brightness(0) invert(1)', marginBottom: '16px' }} /><p style={{ maxWidth: '300px', fontSize: '12px', lineHeight: 1.8, margin: 0 }}>A quiet bamboo garden hideaway in Calumpit, Bulacan, where work and play sit comfortably side by side.</p></div>
          <div><strong style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.1em' }}>EXPLORE</strong><div style={{ display: 'grid', gap: '9px', marginTop: '14px', fontSize: '12px' }}><span onClick={() => navigate('/rooms')} style={{ cursor: 'pointer' }}>Our rooms</span><span onClick={() => navigate('/about-us')} style={{ cursor: 'pointer' }}>Our story</span><span onClick={() => navigate('/amenities')} style={{ cursor: 'pointer' }}>Our amenities</span><span onClick={() => navigate('/contact-us')} style={{ cursor: 'pointer' }}>Contact us</span></div></div>
          <div><strong style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.1em' }}>POLICIES</strong><div style={{ display: 'grid', gap: '9px', marginTop: '14px', fontSize: '12px' }}><span onClick={() => navigate('/privacy-policy')} style={{ cursor: 'pointer' }}>Privacy Policy</span><span onClick={() => navigate('/terms-of-service')} style={{ cursor: 'pointer' }}>Terms of Service</span><span onClick={() => navigate('/cancellation-policy')} style={{ cursor: 'pointer' }}>Cancellation &amp; Refund Policy</span></div></div>
          <div><strong style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.1em' }}>VISIT</strong><p style={{ fontSize: '12px', lineHeight: 1.8, marginTop: '14px' }}>Open daily<br />Day tour 8:00 AM – 5:00 PM<br />Night tour 5:00 PM – 10:00 PM<br />Overnight check-in 10 AM, 2 PM or 6 PM</p></div>
        </div>
        <div style={{ maxWidth: '1100px', borderTop: `1px solid ${LINE}33`, margin: '30px auto 0', paddingTop: '18px', fontSize: '10px' }}>© 2026 Lawiswis Kawayan Garden Resort</div>
      </footer>
      <style>{`
        .client-header-wrap { position: sticky; top: 12px; z-index: 50; padding: 12px 16px 0; }
        .client-header-wrap.is-over-hero { height: 0; padding-top: 0; }
        .client-header-wrap.is-over-hero .client-header { transform: translateY(12px); }
        /* Liquid glass: translucent dark tint, strong blur and saturation, a light
           rim and an inner highlight so it reads as a curved glass pill. */
        .client-glass { position: relative; isolation: isolate; background: linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.10) 100%), rgba(16, 26, 20, 0.42); -webkit-backdrop-filter: blur(22px) saturate(180%); backdrop-filter: blur(22px) saturate(180%); border: 1px solid rgba(255,255,255,0.22); box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.06), 0 10px 30px rgba(10, 18, 12, 0.22); }
        .client-glass::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1; background: radial-gradient(120% 140% at 15% -20%, rgba(255,255,255,0.28), transparent 55%); }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .client-glass { background: rgba(16, 26, 20, 0.92); } }
        .client-header { max-width: 1180px; margin: 0 auto; display: flex; align-items: center; gap: 20px; border-radius: 999px; padding: 9px 9px 9px 26px; transition: box-shadow 0.25s ease, background 0.25s ease; }
        .client-header.is-scrolled { background: linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.08) 100%), rgba(16, 26, 20, 0.62); box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 14px 40px rgba(10, 18, 12, 0.35); }
        .client-header-logo { width: 150px; max-width: 40vw; cursor: pointer; filter: brightness(0) invert(1); flex-shrink: 0; }
        .client-desktop-nav { display: flex; align-items: center; justify-content: center; gap: 6px; flex: 1; }
        .client-nav-link { background: transparent; border: 0; border-radius: 999px; color: rgba(255,255,255,0.86); font: 500 13px ${SANS}; cursor: pointer; padding: 9px 14px; white-space: nowrap; transition: color 0.15s ease, background 0.15s ease; }
        .client-nav-link:hover, .client-nav-link:focus-visible { color: #fff; background: rgba(255,255,255,0.08); }
        .client-nav-link.is-active { color: #fff; background: rgba(255,255,255,0.12); }
        .client-nav-link:focus-visible, .client-dropdown-link:focus-visible, .client-header-cta:focus-visible { outline: 2px solid ${NAV_CTA}; outline-offset: 3px; }
        .client-header-cta { flex-shrink: 0; margin-left: auto; border: 0; border-radius: 999px; padding: 13px 24px; background: ${NAV_CTA}; color: ${NAV_BG}; font: 700 12px ${SANS}; letter-spacing: 0.1em; cursor: pointer; white-space: nowrap; transition: transform 0.15s ease, background 0.15s ease; }
        .client-header-cta:hover:not(:disabled) { background: #fff6cf; transform: translateY(-1px); }
        .client-header-cta:disabled { opacity: 0.6; cursor: not-allowed; }
        .client-dropdown { animation: client-dropdown-in 0.18s ease-out; background: linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04)), rgba(16, 26, 20, 0.72); }
        @keyframes client-dropdown-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        .client-dropdown-link { display: block; width: 100%; text-align: left; padding: 10px 14px; border: 0; border-radius: 10px; background: transparent; color: rgba(255,255,255,0.86); font: 13px ${SANS}; cursor: pointer; }
        .client-dropdown-link:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .client-mobile-menu-toggle { display: none; border: 0; border-radius: 999px; background: rgba(255,255,255,0.1); color: #fff; width: 44px; height: 44px; font-size: 22px; line-height: 1; cursor: pointer; }
        .client-mobile-menu-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(10,18,12,0.62); }
        .client-mobile-nav { position: absolute; inset: 0 0 0 auto; width: min(360px, 88vw); overflow-y: auto; background: ${NAV_BG}; padding: 86px 24px 28px; display: flex; flex-direction: column; align-items: stretch; gap: 8px; box-shadow: -16px 0 40px rgba(0,0,0,0.25); }
        .client-mobile-nav .client-nav-link { width: 100%; text-align: left; padding: 14px 12px; font-size: 14px; }
        .client-mobile-nav .client-dropdown-bridge { position: static !important; transform: none !important; padding-top: 0 !important; }
        .client-mobile-nav .client-dropdown { animation: none; background: rgba(255,255,255,0.04) !important; -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: none; }
        .client-mobile-nav [role="menu"] { position: static !important; min-width: 0 !important; box-shadow: none !important; margin-bottom: 6px; }
        .client-mobile-book-button { border: 0; border-radius: 999px; padding: 14px; margin-top: 12px; background: ${NAV_CTA}; color: ${NAV_BG}; font: 700 12px ${SANS}; letter-spacing: 0.1em; }
        @media (max-width: 1050px) {
          .client-header { gap: 10px !important; padding: 8px 8px 8px 20px !important; }
          .client-desktop-nav { display: none !important; }
          .client-header-cta { padding: 11px 16px; font-size: 11px; }
          .client-mobile-menu-toggle { display: inline-grid; place-items: center; flex-shrink: 0; }
          .client-announcement-bar { padding: 7px 16px !important; }
          .client-announcement-bar > div:first-child { gap: 8px 14px !important; }
          footer > div:first-child { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}