import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase/firebase';
import { collection, doc, getDoc, query, onSnapshot, where } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useSettings } from './SettingsContext';
import ChatPanel from './ChatPanel';
import logo from './logo-mark.png';
import { AnimatedThemeToggler } from '../../client/components/ui/animated-theme-toggler.tsx';
import NotificationBell from './NotificationBell';
import { AccountMenu, TopbarIconButton, topbarButtonStyle } from './TopbarControls';
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
  { label: 'Activity Log',   path: '/admin/activity',      icon: 'ti-list-check' },
  { label: 'Cancellation',   path: '/admin/cancellation',  icon: 'ti-file-x' },
  { label: 'Settings',       path: '/admin/settings',       icon: 'ti-settings' },
];

// Pages that are not in the sidebar — used for the topbar title.
const EXTRA_LABELS = {
  '/admin/settings':     'Settings',
  '/admin/messages':     'Messages',
  '/admin/contact-inquiries': 'Contact Inquiries',
};

// ── Main Layout ──────────────────────────────────────────────
export default function Layout({ children }) {
  const navigate = useNavigate();
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
      navigate={navigate}
      resizable
      defaultWidth={210}
      minWidth={180}
      maxWidth={360}
      widthStorageKey="lkgr_admin_sidebar_width"
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

            <NotificationBell dark={dark} accent={ACCENT} soundAlerts={settings?.soundAlerts} prefix="/admin" />

            <TopbarIconButton
              icon="ti-settings"
              label="Settings"
              dark={dark}
              onClick={() => { navigate('/admin/settings'); }}
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
          {/* Page content eases in (see src/motion.css). */}
          <div className="lk-enter">{children}</div>
        </div>
      </AnimatedSidebarInset>

      {/* Slide-in Messages panel */}
      <ChatPanel dark={dark} accent={ACCENT} open={chatOpen} onClose={() => setChatOpen(false)} />
    </AnimatedSidebarProvider>
  );
}