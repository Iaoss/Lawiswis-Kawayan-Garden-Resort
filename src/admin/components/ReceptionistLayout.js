import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useSettings } from '../components/SettingsContext';

const navItems = [
  { label: 'Dashboard',           path: '/receptionist/dashboard',    icon: 'ti-layout-dashboard' },
  { label: 'Online Reservations', path: '/receptionist/reservations', icon: 'ti-calendar-event' },
  { label: 'Walk-in Reservation', path: '/receptionist/walkin',       icon: 'ti-walk' },
  { label: 'Room Management',     path: '/receptionist/rooms',        icon: 'ti-bed' },
  { label: 'Booking Transactions',path: '/receptionist/transactions', icon: 'ti-credit-card' },
  { label: 'Billing',             path: '/receptionist/billing',      icon: 'ti-receipt' },
  { label: 'Customer Management', path: '/receptionist/customers',    icon: 'ti-users' },
  { label: 'Reservation History', path: '/receptionist/history',      icon: 'ti-clock' },
  { label: 'Cancellation',        path: '/receptionist/cancellation', icon: 'ti-file-x' },
  { label: 'Messages',            path: '/receptionist/messages',     icon: 'ti-message', badge: true },
];

export default function ReceptionistLayout({ children }) {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors PageLayout / Reservations.js palette) ──
  const SIDEBAR       = dark ? '#1c1c1c' : '#ffffff';
  const SIDEBAR_BORDER= dark ? '#2a2a28' : '#f0f0f0';
  const BG            = dark ? '#020b09' : '#f4f6f4';
  const ACTIVE         = settings?.accentColor || '#c8f06e';
  const ACTIVE_TEXT    = '#1a2e1a';
  const NAV_TEXT       = dark ? '#9ca3af' : '#6b7280';
  const NAV_HOVER       = dark ? '#282827' : '#f3f4f6';
  const ACCENT_DARK    = dark ? '#8fb83a' : '#8fb83a';
  const TOPBAR          = dark ? '#1c1c1c' : '#ffffff';
  const TOPBAR_BORDER  = dark ? '#2a2a28' : '#f0f0f0';
  const TEXT            = dark ? '#f0f0f0' : '#111827';
  const MUTED           = dark ? '#9ca3af' : '#9ca3af';
  const BADGE            = '#ef4444';
  const CARD2           = dark ? '#282827' : '#ffffff';
  const BORDER2          = dark ? '#3a3a38' : '#e5e7eb';

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const current = window.location.pathname;

  useEffect(() => {
    if (!document.querySelector('link[href*="tabler-icons"]')) {
      const link = document.createElement('link');
      link.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[href*="fonts.googleapis"]')) {
      const font = document.createElement('link');
      font.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
      font.rel = 'stylesheet';
      document.head.appendChild(font);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.role !== 'receptionist') window.location.href = '/';
          setName(data.name);
          setRole(data.role);
        }
      } else {
        window.location.href = '/';
      }
    });

    const msgsQuery = query(collection(db, 'conversations'), where('unread', '==', true));
    const unsubMsgs = onSnapshot(msgsQuery, (snap) => {
      setUnreadCount(snap.size);
    });

    return () => {
      unsubscribe();
      unsubMsgs();
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'R';

  const currentLabel = navItems.find(n => n.path === current)?.label || 'Dashboard';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Poppins', sans-serif", background: BG }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: '210px', minHeight: '100vh',
        background: SIDEBAR,
        borderRight: `1px solid ${SIDEBAR_BORDER}`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', left: 0, top: 0, zIndex: 100,
        boxShadow: '2px 0 8px rgba(0,0,0,0.04)',
      }}>

        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${SIDEBAR_BORDER}` }}>
          <svg width="26" height="34" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4"  y="0"  width="5"  height="44" rx="2.5" fill="#5a8a4a"/>
            <rect x="4"  y="8"  width="8"  height="3"  rx="1.5" fill="#5a8a4a" opacity="0.6"/>
            <rect x="4"  y="20" width="10" height="3"  rx="1.5" fill="#5a8a4a" opacity="0.6"/>
            <rect x="4"  y="32" width="7"  height="3"  rx="1.5" fill="#5a8a4a" opacity="0.6"/>
            <rect x="14" y="4"  width="5"  height="40" rx="2.5" fill="#5a8a4a" opacity="0.8"/>
            <rect x="14" y="12" width="9"  height="3"  rx="1.5" fill="#5a8a4a" opacity="0.5"/>
            <rect x="14" y="24" width="11" height="3"  rx="1.5" fill="#5a8a4a" opacity="0.5"/>
            <rect x="25" y="2"  width="4"  height="38" rx="2"   fill="#5a8a4a" opacity="0.6"/>
            <rect x="25" y="14" width="8"  height="2.5" rx="1.25" fill="#5a8a4a" opacity="0.4"/>
            <rect x="25" y="26" width="9"  height="2.5" rx="1.25" fill="#5a8a4a" opacity="0.4"/>
          </svg>
          <div>
            <div style={{ color: TEXT, fontWeight: '700', fontSize: '12px', lineHeight: 1.2 }}>Lawiswis Kawayan</div>
            <div style={{ color: ACCENT_DARK, fontSize: '8.5px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: '600' }}>Garden Resort</div>
            <div style={{ color: MUTED, fontSize: '8px', marginTop: '1px' }}>HuaPro Receptionist</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const isActive = current === item.path;
            const showBadge = item.badge && item.label === 'Messages' && unreadCount > 0;
            return (
              <button key={item.label}
                onClick={() => window.location.href = item.path}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                  padding: '8px 10px', borderRadius: '8px', marginBottom: '1px',
                  border: 'none', cursor: 'pointer',
                  fontSize: '12.5px', fontFamily: "'Poppins', sans-serif",
                  background: isActive ? ACTIVE : 'transparent',
                  color: isActive ? ACTIVE_TEXT : NAV_TEXT,
                  fontWeight: isActive ? '600' : '400',
                  transition: 'background 0.12s, color 0.12s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = NAV_HOVER; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: '16px', color: isActive ? ACTIVE_TEXT : NAV_TEXT, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {showBadge && (
                  <span style={{
                    background: BADGE, color: '#fff',
                    borderRadius: '999px', fontSize: '9px',
                    fontWeight: '700', padding: '2px 7px',
                    minWidth: '20px', textAlign: 'center',
                    boxShadow: '0 1px 4px rgba(239,68,68,0.4)',
                  }}>{unreadCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: '14px 12px', borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: ACTIVE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px', color: ACTIVE_TEXT, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: TEXT, fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || 'Receptionist'}</div>
              <div style={{ color: MUTED, fontSize: '10px', textTransform: 'capitalize' }}>{role || 'receptionist'}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '7px 10px', borderRadius: '7px', border: `1px solid ${BORDER2}`,
            background: CARD2, color: NAV_TEXT, fontSize: '11.5px',
            fontFamily: "'Poppins', sans-serif", cursor: 'pointer', fontWeight: '500',
            display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.12s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = NAV_HOVER}
            onMouseLeave={e => e.currentTarget.style.background = CARD2}
          >
            <i className="ti ti-logout" style={{ fontSize: '14px' }} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ marginLeft: '210px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Topbar */}
        <header style={{
          background: TOPBAR,
          borderBottom: `1px solid ${TOPBAR_BORDER}`,
          padding: '0 28px', height: '60px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, zIndex: 99,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div>
            <div style={{ fontWeight: '600', fontSize: '17px', color: TEXT }}>{currentLabel}</div>
            <div style={{ fontSize: '11px', color: MUTED }}>HuaPro Resort Management System</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Settings */}
            <button
              onClick={() => window.location.href = '/receptionist/settings'}
              style={{ width: '36px', height: '36px', borderRadius: '50%', border: `1px solid ${BORDER2}`, background: CARD2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: NAV_TEXT }}>
              <i className="ti ti-settings" style={{ fontSize: '17px' }} />
            </button>

            {/* Bell with unread badge */}
            <button
              onClick={() => window.location.href = '/receptionist/messages'}
              style={{ width: '36px', height: '36px', borderRadius: '50%', border: `1px solid ${BORDER2}`, background: CARD2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: NAV_TEXT, position: 'relative' }}>
              <i className="ti ti-bell" style={{ fontSize: '17px' }} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '4px', right: '4px',
                  background: BADGE, color: '#fff',
                  borderRadius: '999px', fontSize: '8px',
                  fontWeight: '700', padding: '0 4px', minWidth: '14px',
                  textAlign: 'center', lineHeight: '14px', height: '14px',
                  border: '1.5px solid #fff',
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: ACTIVE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: ACTIVE_TEXT }}>
                {initials}
              </div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '13px', color: TEXT }}>{name || 'Receptionist'}</div>
                <div style={{ fontSize: '11px', color: MUTED, textTransform: 'capitalize' }}>{role || 'receptionist'}</div>
              </div>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px', background: BG }}>
          {children}
        </main>
      </div>
    </div>
  );
}