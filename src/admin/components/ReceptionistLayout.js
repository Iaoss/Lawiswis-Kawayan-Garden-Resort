import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase/firebase';
import { doc, getDoc, collection, query, onSnapshot, where } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useSettings } from './SettingsContext';
import ChatPanel from './ChatPanel';
import './portal-sidebar.css';
import logo from './logo-mark.png';
import NotificationBell from './NotificationBell';
import {
  AnimatedSidebarInset,
  AnimatedSidebarProvider,
  AnimatedSidebarTrigger,
} from '../../components/ui/animated-sidebar.tsx';
import PortalSidebar from './PortalSidebar';
import { useStaffAccess } from '../lib/useStaffAccess';
import { AccountMenu, TopbarIconButton, topbarButtonStyle } from './TopbarControls';
import { AnimatedThemeToggler } from '../../client/components/ui/animated-theme-toggler.tsx';

const navItems = [
  { label: 'Dashboard', path: '/receptionist/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Room Management', path: '/receptionist/rooms', icon: 'ti-bed' },
  { label: 'Reservations', path: '/receptionist/reservations', icon: 'ti-calendar-event' },
  { label: 'Walk-in', path: '/receptionist/walkin', icon: 'ti-walk' },
  { label: 'Billing', path: '/receptionist/billing', icon: 'ti-receipt' },
  { label: 'Booking Transactions', path: '/receptionist/transactions', icon: 'ti-credit-card' },
  { label: 'Customers', path: '/receptionist/customers', icon: 'ti-users' },
  { label: 'History', path: '/receptionist/history', icon: 'ti-clock' },
  { label: 'Cancellation', path: '/receptionist/cancellation', icon: 'ti-file-x' },
  { label: 'Messages', path: '/receptionist/messages', icon: 'ti-message-circle-2' },
  { label: 'Settings', path: '/receptionist/settings', icon: 'ti-settings' },
];

// Admin pages that appear in the menu while an admin has given access.
// Labels match the admin menu so they land in the same sidebar groups.
const GRANTED_NAV = [
  { feature: 'reports', label: 'Reports', path: '/receptionist/reports', icon: 'ti-chart-bar' },
  { feature: 'payments', label: 'Payments', path: '/receptionist/payments', icon: 'ti-cash' },
  { feature: 'promos', label: 'Promos & Discounts', path: '/receptionist/promos', icon: 'ti-discount-2' },
  { feature: 'feedback', label: 'Feedback & QR', path: '/receptionist/feedback', icon: 'ti-star' },
  { feature: 'inquiries', label: 'Contact Inquiries', path: '/receptionist/contact-inquiries', icon: 'ti-inbox' },
  { feature: 'news', label: 'News Management', path: '/receptionist/news', icon: 'ti-news' },
  { feature: 'activity', label: 'Activity Log', path: '/receptionist/activity', icon: 'ti-list-check' },
];

const EXTRA_LABELS = {
  '/receptionist/settings': 'Settings',
  '/receptionist/messages': 'Messages',
};

export default function ReceptionistLayout({ children }) {
  const navigate = useNavigate();
  const { settings, updateSetting } = useSettings();
  const access = useStaffAccess();
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('lkgr_receptionist_sidebar_collapsed') === 'true'; }
    catch (error) {
      console.warn('Receptionist sidebar preference could not be restored:', error);
      return false;
    }
  });
  const current = window.location.pathname;

  const dark = settings?.darkMode;
  const SIDEBAR_TEXT = dark ? '#e8e8d8' : '#111827';
  const TOPBAR_BG = dark ? '#1c1c1c' : '#ffffff';
  const BG = dark ? '#020b09' : '#f4f6f4';
  const BORDER = dark ? '#282827' : '#f0f0f0';
  const ACCENT = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const MUTED = dark ? '#5a5a4a' : '#9ca3af';

  useEffect(() => {
    try { localStorage.setItem('lkgr_receptionist_sidebar_collapsed', String(collapsed)); }
    catch (error) { console.warn('Receptionist sidebar preference could not be saved:', error); }
  }, [collapsed]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setStaffEmail(user.email || '');
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.role !== 'receptionist') window.location.href = '/admin/login';
          setStaffName(data.name || 'Receptionist');
          setStaffRole(data.role || 'receptionist');
          setStaffEmail(user.email || data.email || '');
        }
      } else {
        window.location.href = '/admin/login';
      }
    });

    const msgsQuery = query(collection(db, 'conversations'), where('unread', '==', true));
    const unsubMsgs = onSnapshot(msgsQuery, snap => setUnreadCount(snap.size));

    return () => {
      unsubscribe();
      unsubMsgs();
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/admin/login';
  };

  const initials = staffName
    ? staffName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'R';

  const visibleNav = [...navItems, ...GRANTED_NAV.filter(item => access.can(item.feature))];
  const currentLabel = visibleNav.find(n => n.path === current)?.label || EXTRA_LABELS[current] || 'Dashboard';

  return (
    <AnimatedSidebarProvider
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      navigate={navigate}
      resizable
      defaultWidth={210}
      minWidth={180}
      maxWidth={360}
      widthStorageKey="lkgr_receptionist_sidebar_width"
      className="min-h-screen"
      style={{ fontFamily: "'Poppins', sans-serif", background: BG, '--sidebar-width': '210px', '--sidebar-width-icon': '64px', '--sidebar-width-mobile': 'min(18rem, 88vw)' }}
    >
      <PortalSidebar
        navItems={visibleNav}
        currentPath={current}
        unreadCount={unreadCount}
        logo={logo}
        portalName="Receptionist"
        name={staffName || 'Receptionist'}
        role={staffRole || 'receptionist'}
        email={staffEmail}
        initials={initials}
        onLogout={handleLogout}
      />

      <AnimatedSidebarInset className="portal-main-area" style={{ background: BG }}>
        <header style={{
          background: TOPBAR_BG,
          borderBottom: `1px solid ${BORDER}`,
          padding: '0 20px',
          height: '60px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 99,
          boxShadow: dark ? '0 1px 20px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <AnimatedSidebarTrigger className="portal-mobile-menu" aria-label="Open navigation"
            style={{ border: 'none', background: 'transparent', color: SIDEBAR_TEXT, cursor: 'pointer', fontSize: '20px', padding: '6px' }}>
            <i className="ti ti-menu-2" />
          </AnimatedSidebarTrigger>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontWeight: '600', fontSize: '17px', color: SIDEBAR_TEXT }}>{currentLabel}</div>
            <div style={{ fontSize: '11px', color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>HuaPro Resort Management System</div>
          </div>

          <div className="topbar-dock" style={{ '--dock-accent': ACCENT, justifyContent: 'flex-end', flexShrink: 0, marginLeft: 'auto' }}>
            <AnimatedThemeToggler
              theme={dark ? 'dark' : 'light'}
              onThemeChange={(nextTheme) => updateSetting('darkMode', nextTheme === 'dark')}
              variant="circle"
              duration={500}
              aria-label={dark ? 'Light mode' : 'Dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
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

            <NotificationBell dark={dark} accent={ACCENT} soundAlerts={settings?.soundAlerts} prefix="/receptionist" />

            <TopbarIconButton
              icon="ti-settings"
              label="Settings"
              dark={dark}
              onClick={() => { navigate('/receptionist/settings'); }}
            />

            <AccountMenu
              initials={initials}
              name={staffName || 'Receptionist'}
              role={staffRole || 'receptionist'}
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

      <ChatPanel dark={dark} accent={ACCENT} open={chatOpen} onClose={() => setChatOpen(false)} />
    </AnimatedSidebarProvider>
  );
}