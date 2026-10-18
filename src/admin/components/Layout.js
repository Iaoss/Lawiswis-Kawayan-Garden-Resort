import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from '../../firebase/firebase';
import { collection, doc, getDoc, query, onSnapshot, where } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useSettings } from './SettingsContext';
import ChatPanel from './ChatPanel';
import logo from './logo-mark.png';
import { AnimatedThemeToggler } from '../../client/components/ui/animated-theme-toggler.tsx';
import NotificationButton from '../../components/ui/notification-button';
import { AccountMenu, PulsingDot, TopbarIconButton, topbarButtonStyle } from './TopbarControls';
import {
  AnimatedSidebarInset,
  AnimatedSidebarProvider,
  AnimatedSidebarTrigger,
} from '../../components/ui/animated-sidebar.tsx';
import PortalSidebar from './PortalSidebar';
import './portal-sidebar.css';

// ── Nav structure ────────────────────────────────────────────
const navItems = [
  { label: 'Dashboard',      path: '/admin/dashboard',    icon: 'ti-layout-dashboard' },
  { label: 'Room Management',path: '/admin/rooms',         icon: 'ti-bed' },
  { label: 'Reservations',   path: '/admin/reservations',  icon: 'ti-calendar-event' },
  { label: 'Walk-in',        path: '/admin/walkin',        icon: 'ti-walk' },
  { label: 'Billing',        path: '/admin/billing',       icon: 'ti-receipt' },
  { label: 'Payments',       path: '/admin/payments',      icon: 'ti-credit-card' },
  { label: 'Customers',      path: '/admin/customers',     icon: 'ti-users' },
  { label: 'Reports',        path: '/admin/reports',       icon: 'ti-chart-bar' },
  { label: 'History',        path: '/admin/history',       icon: 'ti-clock' },
  { label: 'Promos & Discounts', path: '/admin/promos', icon: 'ti-discount-2' },
  { label: 'Feedback & QR',  path: '/admin/feedback',      icon: 'ti-star' },
  { label: 'Contact Inquiries', path: '/admin/contact-inquiries', icon: 'ti-inbox' },
  { label: 'Email', path: '/admin/email', icon: 'ti-mail' },
  { label: 'Messages', path: '/admin/messages', icon: 'ti-message-circle-2' },
  { label: 'News Management',path: '/admin/news',           icon: 'ti-news' },
  { label: 'Users',          path: '/admin/users',         icon: 'ti-user-cog' },
  { label: 'Cancellation',   path: '/admin/cancellation',  icon: 'ti-file-x' },
  { label: 'Settings',       path: '/admin/settings',       icon: 'ti-settings' },
];

// Pages that are not in the sidebar — used for the topbar title.
const EXTRA_LABELS = {
  '/admin/settings':     'Settings',
  '/admin/messages':     'Messages',
  '/admin/contact-inquiries': 'Contact Inquiries',
};

// ── Read state for notifications ─────────────────────────────
// Navigation here is a full page reload, so "already seen" has to survive
// the reload — otherwise the badge and the chime come back on every page.
const READ_KEY = 'lkgr_read_notifications';

function loadReadIds() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveReadIds(ids) {
  try { localStorage.setItem(READ_KEY, JSON.stringify(ids)); } catch {}
}

const clockTime = (seconds) => seconds
  ? new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : 'Just now';
const formatBookingRef = (id) => `#${String(id || '').slice(0, 8).toUpperCase()}`;
const ACTIVE_MODIFICATION_STATUSES = ['requested', 'needs_review', 'awaiting_payment', 'awaiting_refund'];
const ACTIVE_REFUND_STATUSES = ['requested', 'eligible', 'needs_review', 'awaiting_refund'];

// ── Notification Bell ────────────────────────────────────────
function NotificationBell({ dark, accent, soundAlerts }) {
  const [open, setOpen] = useState(false);
  const [feeds, setFeeds] = useState({ booking: [], dateChange: [], refund: [] });
  const [ready, setReady] = useState(false);
  const [readIds, setReadIds] = useState(loadReadIds);

  const firedRef  = useRef({ booking: false });
  const seededRef = useRef(false);
  const knownRef  = useRef(new Set());
  const dotRef    = useRef(new Set());

  const ACCENT      = accent || '#c8f06e';
  const PANEL_BG    = dark ? '#1c1c1c' : '#ffffff';
  const BORDER      = dark ? '#282827' : '#e5e7eb';
  const TEXT        = dark ? '#e8e8d8' : '#111827';
  const MUTED       = dark ? '#5a5a4a' : '#9ca3af';
  const FAINT       = dark ? '#3a3a2a' : '#c9c9c9';
  const ROW_A       = dark ? '#1c1c1c' : '#ffffff';
  const ROW_B       = dark ? '#202020' : '#f9fafb';
  const ROW_HOVER   = dark ? '#282827' : '#f3f4f6';
  const ICON_BG     = dark ? '#282827' : '#f3f4f6';
  const BTN_BG      = dark ? '#282827' : '#f3f4f6';
  const BTN_BORDER  = dark ? '#383837' : '#e5e7eb';

  const playSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.18);
    } catch {
      // Browser blocks audio until the user has interacted with the page.
    }
  };

  // Three independent listeners. The previous version nested them, so the
  // inner listeners were recreated on every outer snapshot and never
  // unsubscribed — which is part of why the chime fired repeatedly.
  useEffect(() => {
    const markFired = (key) => {
      firedRef.current[key] = true;
      if (firedRef.current.booking) setReady(true);
    };

    const unsubBooking = onSnapshot(
      query(collection(db, 'reservations'), where('type', '==', 'online')),
      (snap) => {
        const rows = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        const booking = rows
          .filter(item => String(item.status || '').toLowerCase() === 'pending')
          .slice(0, 5)
          .map(item => ({
            id: `new-booking_${item.id}`,
            icon: 'ti-calendar-plus',
            badge: 'New Booking',
            message: `${item.guestName || 'Guest'} · ${formatBookingRef(item.id)}`,
            details: `${item.checkIn || '—'} → ${item.checkOut || '—'} · ₱${Number(item.totalAmount || 0).toLocaleString()}`,
            time: clockTime(item.createdAt?.seconds),
            bookingId: item.id,
            path: '/admin/reservations',
          }));

        const dateChange = rows
          .filter(item => item.modificationRequest && ACTIVE_MODIFICATION_STATUSES.includes(String(item.modificationRequest.status || '').toLowerCase()))
          .slice(0, 5)
          .map(item => {
            const request = item.modificationRequest || {};
            return {
              id: `date-change_${request.id || item.id}`,
              icon: 'ti-calendar-time',
              badge: 'Date Modified',
              message: `${item.guestName || 'Guest'} · ${formatBookingRef(item.id)}`,
              details: `${request.originalCheckIn || item.checkIn || '—'} → ${request.requestedCheckIn || item.checkIn || '—'} · ${request.originalCheckOut || item.checkOut || '—'} → ${request.requestedCheckOut || item.checkOut || '—'}`,
              time: clockTime(request.requestedAt?.seconds || item.createdAt?.seconds),
              bookingId: item.id,
              path: '/admin/reservations',
            };
          });

        const refund = rows
          .filter(item => item.cancellationRequested || ACTIVE_REFUND_STATUSES.includes(String(item.refundRequestStatus || '').toLowerCase()))
          .slice(0, 5)
          .map(item => {
            const refundRequested = ACTIVE_REFUND_STATUSES.includes(String(item.refundRequestStatus || '').toLowerCase());
            const reason = item.refundDecision?.reason || item.cancellationReason || 'Awaiting staff review';
            return {
              id: `${refundRequested ? 'refund-requested' : 'cancellation-requested'}_${item.id}`,
              icon: refundRequested ? 'ti-receipt-refund' : 'ti-calendar-x',
              badge: refundRequested ? 'Refund Requested' : 'Cancellation Requested',
              message: `${item.guestName || 'Guest'} · ${formatBookingRef(item.id)}`,
              details: `${reason}${refundRequested ? ` · ₱${Number(item.refundDecision?.refundableAmount || 0).toLocaleString()}` : ''}`,
              time: clockTime(item.refundRequestedAt?.seconds || item.cancellationRequestedAt?.seconds || item.createdAt?.seconds),
              bookingId: item.id,
              path: '/admin/reservations',
            };
          });

        setFeeds({ booking, dateChange, refund });
        markFired('booking');
      }
    );

    return () => { unsubBooking(); };
  }, []);

  const notifications = useMemo(
    () => [...feeds.booking, ...feeds.dateChange, ...feeds.refund].slice(0, 12),
    [feeds]
  );

  const unread = notifications.filter(n => !readIds.includes(n.id)).length;

  // Chime only for items that arrive after the first full load and that
  // have not already been read. Nothing plays on mount or on navigation.
  useEffect(() => {
    if (!ready) return;
    const ids = notifications.map(n => n.id);

    if (!seededRef.current) {
      seededRef.current = true;
      knownRef.current = new Set(ids);
      return;
    }

    const fresh = ids.filter(id => !knownRef.current.has(id) && !readIds.includes(id));
    ids.forEach(id => knownRef.current.add(id));
    if (fresh.length > 0 && soundAlerts) playSound();
  }, [ready, notifications, readIds, soundAlerts]);

  const markRead = (ids) => {
    setReadIds(prev => {
      const next = Array.from(new Set([...prev, ...ids])).slice(-300);
      saveReadIds(next);
      return next;
    });
  };

  const toggleOpen = () => {
    const next = !open;
    if (next) {
      // Keep showing which ones were new while the panel is open,
      // but clear the badge as soon as they have been seen.
      dotRef.current = new Set(notifications.filter(n => !readIds.includes(n.id)).map(n => n.id));
      markRead(notifications.map(n => n.id));
    }
    setOpen(next);
  };

  const openItem = (n) => {
    markRead([n.id]);
    setOpen(false);
    const bookingParam = n.bookingId ? `${n.path}?booking=${encodeURIComponent(n.bookingId)}` : n.path;
    window.location.href = bookingParam;
  };

  return (
    <div style={{ position: 'relative' }}>
      <NotificationButton
        onClick={toggleOpen}
        aria-label={unread > 0 ? `Alerts (${unread} unread)` : 'Alerts'}
        title="Alerts"
        icon={<i className="ti ti-bell" style={{ fontSize: '18px', color: TEXT, flexShrink: 0 }} />}
        style={{
          position: 'relative',
          width: '38px',
          height: '38px',
          padding: 0,
          flexShrink: 0,
          borderRadius: '10px',
          border: `1px solid ${BTN_BORDER}`,
          background: BTN_BG,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {unread > 0 && <PulsingDot color={accent} />}
      </NotificationButton>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
          <div style={{
            position: 'absolute', right: 0, top: '46px', width: '340px',
            background: PANEL_BG, borderRadius: '16px', border: `1px solid ${BORDER}`,
            boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)', zIndex: 200,
          }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: TEXT, fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', gap: '7px' }}>
                <i className="ti ti-bell" style={{ fontSize: '15px' }} />
                Notifications
              </div>
              <span style={{ fontSize: '11px', color: ACCENT, fontWeight: '600', cursor: 'pointer' }} onClick={() => setOpen(false)}>Close</span>
            </div>

            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: MUTED, fontSize: '12px' }}>
                  <i className="ti ti-bell-off" style={{ fontSize: '26px', display: 'block', marginBottom: '8px' }} />
                  Nothing new right now
                </div>
              ) : notifications.map((n, i) => {
                const isNew = dotRef.current.has(n.id);
                return (
                  <div key={n.id}
                    style={{
                      padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
                      background: i % 2 === 0 ? ROW_A : ROW_B,
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = ROW_HOVER}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? ROW_A : ROW_B}
                  >
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: ICON_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={`ti ${n.icon}`} style={{ fontSize: '17px', color: TEXT }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: `1px solid ${ACCENT}55`, background: `${ACCENT}22`, color: TEXT, fontSize: 10, fontWeight: 700, letterSpacing: '.03em', padding: '2px 8px', marginBottom: 6 }}>{n.badge}</span>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT }}>{n.message}</div>
                      <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{n.details}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
                        <div style={{ fontSize: '10px', color: FAINT }}>{n.time}</div>
                        <button type="button" onClick={() => openItem(n)} style={{ border: `1px solid ${BORDER}`, background: dark ? '#252525' : '#fff', color: TEXT, borderRadius: 8, fontSize: 10, fontWeight: 700, padding: '5px 8px', cursor: 'pointer' }}>
                          Open booking
                        </button>
                      </div>
                    </div>
                    {isNew && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ACCENT, flexShrink: 0, marginTop: '4px' }} />}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Bookings', icon: 'ti-calendar-event',   path: '/admin/reservations', bg: 'rgba(200,240,110,0.1)', color: '#8fb83a' },
                { label: 'Payments', icon: 'ti-credit-card',      path: '/admin/payments',     bg: 'rgba(251,191,36,0.1)',  color: '#d97706' },
                { label: 'Messages', icon: 'ti-message-circle-2', path: '/admin/messages',     bg: 'rgba(167,139,250,0.1)', color: '#7c5ce0' },
              ].map(b => (
                <button key={b.label} onClick={() => { setOpen(false); window.location.href = b.path; }}
                  style={{ background: b.bg, color: b.color, border: `1px solid ${b.color}22`, borderRadius: '8px', padding: '10px 6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <i className={`ti ${b.icon}`} style={{ fontSize: '13px' }} />
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Layout ──────────────────────────────────────────────
export default function Layout({ children }) {
  const { settings, updateSetting } = useSettings();
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [emailUnread, setEmailUnread] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('lkgr_admin_sidebar_collapsed') === 'true'; }
    catch (error) {
      console.warn('Admin sidebar preference could not be restored:', error);
      return false;
    }
  });
  const current = window.location.pathname;

  const dark = settings?.darkMode;

  const SIDEBAR_TEXT = dark ? '#e8e8d8'  : '#111827';
  const TOPBAR_BG    = dark ? '#1c1c1c'  : '#ffffff';
  const BG           = dark ? '#020b09'  : '#f4f6f4';
  const BORDER       = dark ? '#282827'  : '#f0f0f0';
  const ACCENT       = settings?.accentColor || '#c8f06e';
  const ACCENT_TEXT  = '#0a1a0a';
  const MUTED        = dark ? '#5a5a4a'  : '#9ca3af';

  useEffect(() => {
    try { localStorage.setItem('lkgr_admin_sidebar_collapsed', String(collapsed)); }
    catch (error) { console.warn('Admin sidebar preference could not be saved:', error); }
  }, [collapsed]);

  useEffect(() => {
    if (!document.querySelector('link[href*="tabler-icons"]')) {
      const link = document.createElement('link');
      link.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css';
      link.rel = 'stylesheet'; document.head.appendChild(link);
    }
    if (!document.querySelector('link[href*="fonts.googleapis"]')) {
      const font = document.createElement('link');
      font.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
      font.rel = 'stylesheet'; document.head.appendChild(font);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setAdminName(userDoc.data().name);
          setAdminRole(userDoc.data().role);
        }
      } else {
        window.location.href = '/admin/login';
      }
    });

    const msgsQuery = query(collection(db, 'conversations'), where('unread', '==', true));
    const unsubMsgs = onSnapshot(msgsQuery, snap => setUnreadCount(snap.size));

    const unsubMail = onSnapshot(
      query(collection(db, 'emails'), where('folder', '==', 'inbox'), where('read', '==', false)),
      (snap) => setEmailUnread(snap.size),
      () => {} // ignore errors until the Firestore rules are set
    );

    return () => {
      unsubscribe();
      unsubMsgs();
      unsubMail();
    };
  }, []);

  const handleLogout = async () => { await signOut(auth); window.location.href = '/admin/login'; };

  const initials = adminName
    ? adminName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'A';

  const currentLabel =
    navItems.find(n => n.path === current)?.label || EXTRA_LABELS[current] || 'Dashboard';

  return (
    <AnimatedSidebarProvider
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      className="min-h-screen"
      style={{ fontFamily: "'Poppins', sans-serif", background: BG, '--sidebar-width': '210px', '--sidebar-width-icon': '64px', '--sidebar-width-mobile': 'min(18rem, 88vw)' }}
    >
      <PortalSidebar
        navItems={navItems}
        currentPath={current}
        unreadCount={unreadCount}
        emailUnread={emailUnread}
        logo={logo}
        portalName="Admin"
        name={adminName || 'Admin'}
        role={adminRole}
        initials={initials}
        onLogout={handleLogout}
      />

      {/* ── Main area ── */}
      <AnimatedSidebarInset className="portal-main-area" style={{ background: BG }}>

        {/* Topbar */}
        <header style={{
          background: TOPBAR_BG,
          borderBottom: `1px solid ${BORDER}`,
          padding: '0 28px', height: '60px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, zIndex: 99,
          boxShadow: dark ? '0 1px 20px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <AnimatedSidebarTrigger className="portal-mobile-menu" aria-label="Open navigation"
            style={{ border: 'none', background: 'transparent', color: SIDEBAR_TEXT, cursor: 'pointer', fontSize: '20px', padding: '6px' }}>
            <i className="ti ti-menu-2" />
          </AnimatedSidebarTrigger>
          <div>
            <div style={{ fontWeight: '600', fontSize: '17px', color: SIDEBAR_TEXT }}>{currentLabel}</div>
            <div style={{ fontSize: '11px', color: MUTED }}>HuaPro Resort Management System</div>
          </div>

          <div className="topbar-dock" style={{ '--dock-accent': ACCENT, justifyContent: 'flex-end', flexShrink: 0, marginLeft: 'auto' }}>
            <AnimatedThemeToggler
              theme={dark ? 'dark' : 'light'}
              onThemeChange={(nextTheme) => updateSetting('darkMode', nextTheme === 'dark')}
              variant="circle"
              duration={500}
              aria-label={dark ? 'Light' : 'Dark'}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                padding: 0,
                flexShrink: 0,
                borderRadius: '10px',
                cursor: 'pointer',
                ...topbarButtonStyle(dark),
              }}
            />

            <TopbarIconButton
              icon="ti-message-circle-2"
              label="Messages"
              dark={dark}
              badge={unreadCount}
              onClick={() => setChatOpen(true)}
            />

            <NotificationBell dark={dark} accent={ACCENT} soundAlerts={settings?.soundAlerts} />

            <TopbarIconButton
              icon="ti-settings"
              label="Settings"
              dark={dark}
              onClick={() => { window.location.href = '/admin/settings'; }}
            />

            <AccountMenu
              initials={initials}
              name={adminName || 'Admin'}
              role={adminRole}
              dark={dark}
              accent={ACCENT}
              accentText={ACCENT_TEXT}
              onSignOut={handleLogout}
            />
          </div>
        </header>

        <div className="portal-main-content" style={{ flex: 1, padding: '28px', background: BG }}>
          {children}
        </div>
      </AnimatedSidebarInset>

      {/* Slide-in Messages panel */}
      <ChatPanel dark={dark} accent={ACCENT} open={chatOpen} onClose={() => setChatOpen(false)} />
    </AnimatedSidebarProvider>
  );
}