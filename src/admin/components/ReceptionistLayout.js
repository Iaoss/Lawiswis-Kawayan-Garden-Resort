import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { auth, db } from '../../firebase/firebase';
import { doc, getDoc, collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useSettings } from './SettingsContext';
import ChatPanel from './ChatPanel';
import logo from './logo-mark.png';

function ExpandableIconButton({ icon, label, onClick, badge, dark }) {
  const BORDER = dark ? '#383837' : '#e5e7eb';
  const BG = dark ? '#282827' : '#f3f4f6';
  const TEXT = dark ? '#e8e8d8' : '#111827';

  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        position: 'relative',
        width: '40px',
        height: '38px',
        flexShrink: 0,
        borderRadius: '10px',
        border: `1px solid ${BORDER}`,
        background: BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: '17px', color: TEXT, flexShrink: 0 }} />
      {badge > 0 && (
        <div style={{
          position: 'absolute', top: '-5px', right: '-5px',
          width: '18px', height: '18px', background: '#ef4444',
          borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: '700',
        }}>
          {badge > 9 ? '9+' : badge}
        </div>
      )}
    </button>
  );
}

const navItems = [
  { label: 'Dashboard', path: '/receptionist/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Online Reservations', path: '/receptionist/reservations', icon: 'ti-calendar-event' },
  { label: 'Walk-in Reservation', path: '/receptionist/walkin', icon: 'ti-walk' },
  { label: 'Room Management', path: '/receptionist/rooms', icon: 'ti-bed' },
  { label: 'Booking Transactions', path: '/receptionist/transactions', icon: 'ti-credit-card' },
  { label: 'Billing', path: '/receptionist/billing', icon: 'ti-receipt' },
  { label: 'Customer Management', path: '/receptionist/customers', icon: 'ti-users' },
  { label: 'Reservation History', path: '/receptionist/history', icon: 'ti-clock' },
  { label: 'Cancellation', path: '/receptionist/cancellation', icon: 'ti-file-x' },
  { label: 'Messages', path: '/receptionist/messages', icon: 'ti-message-circle-2' },
];

const EXTRA_LABELS = {
  '/receptionist/settings': 'Settings',
  '/receptionist/messages': 'Messages',
};

const READ_KEY = 'lkgr_read_notifications';

function loadReadIds() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReadIds(ids) {
  try { localStorage.setItem(READ_KEY, JSON.stringify(ids)); } catch {}
}

const clockTime = (seconds) => seconds
  ? new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : 'Just now';

function NotificationBell({ dark, accent, soundAlerts }) {
  const [open, setOpen] = useState(false);
  const [feeds, setFeeds] = useState({ res: [], pay: [], msg: [] });
  const [ready, setReady] = useState(false);
  const [readIds, setReadIds] = useState(loadReadIds);

  const firedRef = useRef({ res: false, pay: false, msg: false });
  const seededRef = useRef(false);
  const knownRef = useRef(new Set());
  const dotRef = useRef(new Set());

  const ACCENT = accent || '#9cb56f';
  const PANEL_BG = dark ? '#1c1c1c' : '#ffffff';
  const BORDER = dark ? '#282827' : '#e5e7eb';
  const TEXT = dark ? '#e8e8d8' : '#111827';
  const MUTED = dark ? '#5a5a4a' : '#9ca3af';
  const FAINT = dark ? '#3a3a2a' : '#c9c9c9';
  const ROW_A = dark ? '#1c1c1c' : '#ffffff';
  const ROW_B = dark ? '#202020' : '#f9fafb';
  const ROW_HOVER = dark ? '#282827' : '#f3f4f6';
  const ICON_BG = dark ? '#282827' : '#f3f4f6';
  const BTN_BG = dark ? '#282827' : '#f3f4f6';
  const BTN_BORDER = dark ? '#383837' : '#e5e7eb';

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

  useEffect(() => {
    const markFired = (key) => {
      firedRef.current[key] = true;
      if (firedRef.current.res && firedRef.current.pay && firedRef.current.msg) setReady(true);
    };

    const unsubRes = onSnapshot(
      query(collection(db, 'reservations'), where('type', '==', 'online')),
      (snap) => {
        const res = snap.docs
          .filter(d => d.data().status === 'pending')
          .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
          .slice(0, 5)
          .map(d => ({
            id: `res_${d.id}`,
            icon: 'ti-calendar-plus',
            message: `New booking from ${d.data().guestName || 'Guest'}`,
            sub: `Room ${d.data().roomNumber || '—'} · ${d.data().checkIn || ''}`,
            time: clockTime(d.data().createdAt?.seconds),
            path: '/receptionist/reservations',
          }));
        setFeeds(prev => ({ ...prev, res }));
        markFired('res');
      }
    );

    const unsubPay = onSnapshot(
      query(
        collection(db, 'reservations'),
        where('type', '==', 'online'),
        where('paymentStatus', '==', 'paid'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        const pay = snap.docs.slice(0, 5).map(d => ({
          id: `pay_${d.id}`,
          icon: 'ti-cash',
          message: `Payment received from ${d.data().guestName || 'Guest'}`,
          sub: `Room ${d.data().roomNumber || '—'} · ₱${Number(d.data().totalAmount || 0).toLocaleString()}`,
          time: clockTime(d.data().createdAt?.seconds),
          path: '/receptionist/billing',
        }));
        setFeeds(prev => ({ ...prev, pay }));
        markFired('pay');
      }
    );

    const unsubMsg = onSnapshot(
      query(collection(db, 'conversations'), where('unread', '==', true)),
      (snap) => {
        const msg = snap.docs.slice(0, 3).map(d => ({
          id: `msg_${d.id}`,
          icon: 'ti-message-circle-2',
          message: `New message from ${d.data().guestName || 'Guest'}`,
          sub: d.data().lastMessage || 'New message',
          time: clockTime(d.data().lastMessageAt?.seconds),
          path: '/receptionist/messages',
        }));
        setFeeds(prev => ({ ...prev, msg }));
        markFired('msg');
      }
    );

    return () => {
      unsubRes();
      unsubPay();
      unsubMsg();
    };
  }, []);

  const notifications = useMemo(
    () => [...feeds.res, ...feeds.pay, ...feeds.msg].slice(0, 10),
    [feeds]
  );

  const unread = notifications.filter(n => !readIds.includes(n.id)).length;

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
      dotRef.current = new Set(notifications.filter(n => !readIds.includes(n.id)).map(n => n.id));
      markRead(notifications.map(n => n.id));
    }
    setOpen(next);
  };

  const openItem = (n) => {
    markRead([n.id]);
    setOpen(false);
    window.location.href = n.path;
  };

  return (
    <div style={{ position: 'relative' }}>
      <motion.button
        onClick={toggleOpen}
        aria-label="Alerts"
        style={{
          position: 'relative',
          minWidth: '76px',
          height: '38px',
          flexShrink: 0,
          borderRadius: '10px',
          border: `1px solid ${BTN_BORDER}`,
          background: BTN_BG,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', overflow: 'hidden',
        }}
      >
        <i className="ti ti-bell" style={{ fontSize: '18px', color: TEXT, flexShrink: 0 }} />
        <span style={{ whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 600, color: TEXT }}>Alerts</span>
        {unread > 0 && (
          <div style={{
            position: 'absolute', top: '-5px', right: '-5px',
            width: '18px', height: '18px', background: '#ef4444',
            borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: '700',
          }}>
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </motion.button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
          <div style={{
            position: 'absolute', right: 0, top: '46px', width: '340px',
            background: PANEL_BG, borderRadius: '16px', border: `1px solid ${BORDER}`,
            boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)', zIndex: 200,
          }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: TEXT, display: 'flex', alignItems: 'center', gap: '7px' }}>
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
                  <div key={n.id} onClick={() => openItem(n)}
                    style={{
                      padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
                      cursor: 'pointer', background: i % 2 === 0 ? ROW_A : ROW_B,
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = ROW_HOVER}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? ROW_A : ROW_B}
                  >
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: ICON_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={`ti ${n.icon}`} style={{ fontSize: '17px', color: TEXT }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT }}>{n.message}</div>
                      <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</div>
                      <div style={{ fontSize: '10px', color: FAINT, marginTop: '3px' }}>{n.time}</div>
                    </div>
                    {isNew && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ACCENT, flexShrink: 0, marginTop: '4px' }} />}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Bookings', icon: 'ti-calendar-event', path: '/receptionist/reservations', bg: 'rgba(200,240,110,0.1)', color: '#8fb83a' },
                { label: 'Billing', icon: 'ti-receipt', path: '/receptionist/billing', bg: 'rgba(251,191,36,0.1)', color: '#d97706' },
                { label: 'Messages', icon: 'ti-message-circle-2', path: '/receptionist/messages', bg: 'rgba(167,139,250,0.1)', color: '#7c5ce0' },
              ].map(b => (
                <button key={b.label} onClick={() => { setOpen(false); window.location.href = b.path; }}
                  style={{ background: b.bg, color: b.color, border: `1px solid ${b.color}22`, borderRadius: '8px', padding: '10px 6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
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

export default function ReceptionistLayout({ children }) {
  const { settings, updateSetting } = useSettings();
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const current = window.location.pathname;

  const dark = settings?.darkMode;
  const collapsed = false;

  const SIDEBAR_BG = dark ? '#1c1c1c' : '#ffffff';
  const SIDEBAR_TEXT = dark ? '#e8e8d8' : '#111827';
  const TOPBAR_BG = dark ? '#1c1c1c' : '#ffffff';
  const BG = dark ? '#020b09' : '#f4f6f4';
  const BORDER = dark ? '#282827' : '#f0f0f0';
  const NAV_TEXT = dark ? '#8a8a7a' : '#6b7280';
  const ACCENT = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const MUTED = dark ? '#5a5a4a' : '#9ca3af';
  const sidebarWidth = collapsed ? '64px' : '210px';

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
          setStaffName(data.name || 'Receptionist');
          setStaffRole(data.role || 'receptionist');
        }
      } else {
        window.location.href = '/';
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
    window.location.href = '/';
  };

  const initials = staffName
    ? staffName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'R';

  const currentLabel = navItems.find(n => n.path === current)?.label || EXTRA_LABELS[current] || 'Dashboard';

  const navButtonStyle = (isActive) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? '0' : '9px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '10px 0' : '8px 10px',
    borderRadius: '8px',
    marginBottom: '1px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12.5px',
    fontFamily: "'Poppins', sans-serif",
    background: isActive ? ACCENT : 'transparent',
    color: isActive ? ACCENT_TEXT : NAV_TEXT,
    fontWeight: isActive ? '600' : '400',
    textAlign: 'left',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Poppins', sans-serif", background: BG }}>
      <aside
        style={{
          minHeight: '100vh',
          background: SIDEBAR_BG,
          borderRight: `1px solid ${BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 100,
          boxShadow: dark ? '2px 0 20px rgba(0,0,0,0.4)' : '2px 0 8px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: collapsed ? '18px 0' : '22px 16px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: '10px',
          borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <img
              src={logo}
              alt="Lawiswis Kawayan Garden Resort"
              style={{ width: '28px', height: '34px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, display: 'block' }}
            />
            {!collapsed && <div style={{ minWidth: 0, whiteSpace: 'nowrap' }}>
              <div style={{ color: dark ? '#d4d4c4' : '#111827', fontWeight: '700', fontSize: '12px', lineHeight: 1.2 }}>Lawiswis Kawayan</div>
              <div style={{ color: dark ? '#c8f06e' : '#8fb83a', fontSize: '8.5px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: '600' }}>Garden Resort</div>
              <div style={{ color: MUTED, fontSize: '8px', marginTop: '1px' }}>HuaPro Receptionist</div>
            </div>}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const isActive = current === item.path;
            return (
              <button key={item.label}
                onClick={() => window.location.href = item.path}
                title={collapsed ? item.label : ''}
                style={navButtonStyle(isActive)}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: '16px', flexShrink: 0, color: isActive ? ACCENT_TEXT : NAV_TEXT }} />
                {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', textAlign: 'left' }}>{item.label}</span>}
                {item.path === '/receptionist/messages' && unreadCount > 0 && (
                  <span style={{ minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '999px', background: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: collapsed ? '14px 0' : '14px 12px', borderTop: `1px solid ${BORDER}` }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', background: ACCENT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '12px', color: ACCENT_TEXT, flexShrink: 0,
              }}>{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: SIDEBAR_TEXT, fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staffName || 'Receptionist'}</div>
                <div style={{ color: MUTED, fontSize: '10px', textTransform: 'capitalize' }}>{staffRole || 'receptionist'}</div>
              </div>
            </div>
          )}
          <button onClick={handleLogout} style={{
            width: '100%', padding: '7px 10px', borderRadius: '7px',
            border: `1px solid ${BORDER}`,
            background: dark ? '#282827' : '#fff',
            color: NAV_TEXT, fontSize: '11.5px',
            fontFamily: "'Poppins', sans-serif", cursor: 'pointer', fontWeight: '500',
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '6px',
          }}
          >
            <i className="ti ti-logout" style={{ fontSize: '14px' }} />
            {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>Sign out</span>}
          </button>
        </div>
      </aside>

      <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
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
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontWeight: '600', fontSize: '17px', color: SIDEBAR_TEXT }}>{currentLabel}</div>
            <div style={{ fontSize: '11px', color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>HuaPro Resort Management System</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
            <ExpandableIconButton
              icon={dark ? 'ti-sun' : 'ti-moon'}
              label={dark ? 'Light' : 'Dark'}
              dark={dark}
              onClick={() => updateSetting('darkMode', !dark)}
            />

            <ExpandableIconButton
              icon="ti-settings"
              label="Settings"
              dark={dark}
              onClick={() => window.location.href = '/receptionist/settings'}
            />

            <ExpandableIconButton
              icon="ti-message-circle-2"
              label="Messages"
              dark={dark}
              badge={unreadCount}
              onClick={() => setChatOpen(true)}
            />

            <NotificationBell dark={dark} accent={ACCENT} soundAlerts={settings?.soundAlerts} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', background: ACCENT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '13px', color: ACCENT_TEXT,
              }}>{initials}</div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '13px', color: SIDEBAR_TEXT }}>{staffName || 'Receptionist'}</div>
                <div style={{ fontSize: '11px', color: MUTED, textTransform: 'capitalize' }}>{staffRole || 'receptionist'}</div>
              </div>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px', background: BG }}>
          {children}
        </main>
      </div>

      <ChatPanel dark={dark} accent={ACCENT} open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}