import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../../firebase/firebase';
import { collection, doc, getDoc, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useSettings } from './SettingsContext';
import ChatPanel from './ChatPanel';

const C = {
  sidebar:      '#1c1c1c',
  sidebarBorder:'#282827',
  bg:           '#020b09',
  active:       '#c8f06e',
  activeText:   '#0a1a0a',
  navText:      '#8a8a7a',
  navHover:     '#282827',
  accentDark:   '#9ab83a',
  topbar:       '#1c1c1c',
  topbarBorder: '#282827',
  text:         '#e8e8d8',
  muted:        '#5a5a4a',
  badge:        '#ef4444',
  card:         '#1c1c1c',
  border:       '#282827',
};

// ── Animation helpers for expandable icon buttons ───────────
const expandTransition = { type: 'spring', bounce: 0, duration: 0.4 };

const btnVariants = {
  rest:  { paddingLeft: 10, paddingRight: 10, gap: 0 },
  hover: { paddingLeft: 14, paddingRight: 14, gap: 8 },
};

const labelVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: 'auto', opacity: 1 },
  exit:    { width: 0, opacity: 0 },
};

// ── Reusable expandable icon button (Settings / Chat) ───────
function ExpandableIconButton({ icon, label, onClick, badge, dark }) {
  const [hover, setHover] = useState(false);
  const BORDER = dark ? '#383837' : '#e5e7eb';
  const BG     = dark ? '#282827' : '#f3f4f6';
  const TEXT   = dark ? '#e8e8d8' : '#111827';

  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      variants={btnVariants}
      initial="rest"
      animate={hover ? 'hover' : 'rest'}
      transition={expandTransition}
      style={{
        position: 'relative',
        height: '38px',
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
      <AnimatePresence initial={false}>
        {hover && (
          <motion.span
            variants={labelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={expandTransition}
            style={{
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              fontSize: '12px',
              fontWeight: 600,
              color: TEXT,
            }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

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
    </motion.button>
  );
}

// ── Nav structure ────────────────────────────────────────────
const navItems = [
  { label: 'Dashboard',      path: '/admin/dashboard',    icon: 'ti-layout-dashboard' },
  { label: 'Room Management',path: '/admin/rooms',         icon: 'ti-bed' },
  { label: 'Reservations',   path: '/admin/reservations',  icon: 'ti-calendar-event' },
  { label: 'Walk-in',        path: '/admin/walkin',        icon: 'ti-walk' },
  { label: 'Billing',        path: '/admin/billing',       icon: 'ti-receipt' },
  { label: 'Payments',       path: '/admin/payments',      icon: 'ti-credit-card' },
  { label: 'Customers',      path: '/admin/customers',     icon: 'ti-users' },
  { label: 'History',        path: '/admin/history',       icon: 'ti-clock' },
  { label: 'Reports',        path: '/admin/reports',       icon: 'ti-chart-bar' },
  { label: 'Users',          path: '/admin/users',         icon: 'ti-settings' },
  { label: 'Feedback & QR',  path: '/admin/feedback',      icon: 'ti-star' },
  { label: 'Cancellation',   path: '/admin/cancellation',  icon: 'ti-file-x' },
  { label: 'Settings',       path: '/admin/settings',      icon: 'ti-adjustments' },
];

// ── Notification Bell ────────────────────────────────────────
function NotificationBell({ dark, accent, soundAlerts }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const prevNotificationIdsRef = useRef([]);
  const firstSnapshotRef = useRef(true);

  const ACCENT      = accent || '#c8f06e';
  const PANEL_BG    = dark ? '#1c1c1c' : '#ffffff';
  const BORDER      = dark ? '#282827' : '#e5e7eb';

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
    } catch (error) {
      // Browser may block auto-play if user has not interacted yet.
    }
  };

  useEffect(() => {
    const currentIds = notifications.map(n => n.id);
    if (firstSnapshotRef.current) {
      firstSnapshotRef.current = false;
      prevNotificationIdsRef.current = currentIds;
      return;
    }

    if (soundAlerts && currentIds.some(id => !prevNotificationIdsRef.current.includes(id))) {
      playSound();
    }
    prevNotificationIdsRef.current = currentIds;
  }, [notifications, soundAlerts]);
  const TEXT        = dark ? '#e8e8d8' : '#111827';
  const MUTED       = dark ? '#5a5a4a' : '#9ca3af';
  const FAINT       = dark ? '#3a3a2a' : '#c9c9c9';
  const ROW_A       = dark ? '#1c1c1c' : '#ffffff';
  const ROW_B       = dark ? '#202020' : '#f9fafb';
  const ROW_HOVER   = dark ? '#282827' : '#f3f4f6';
  const ICON_BG     = dark ? '#282827' : '#f3f4f6';
  const BTN_BG      = dark ? '#282827' : '#f3f4f6';
  const BTN_BORDER  = dark ? '#383837' : '#e5e7eb';

  useEffect(() => {
    const resQuery = query(collection(db, 'reservations'), where('type', '==', 'online'));
    const unsubRes = onSnapshot(resQuery, (resSnap) => {
      const resNotifs = resSnap.docs
        .filter(d => d.data().status === 'pending')
        .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
        .slice(0, 5)
        .map(d => ({
          id: `res_${d.id}`, type: 'reservation', icon: '📋',
          message: `New booking from ${d.data().guestName || 'Guest'}`,
          sub: `Room ${d.data().roomNumber || '—'} · ${d.data().checkIn || ''}`,
          time: d.data().createdAt?.seconds
            ? new Date(d.data().createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          path: '/admin/reservations',
        }));

      const payQuery = query(collection(db, 'reservations'), where('type', '==', 'online'), where('paymentStatus', '==', 'paid'), orderBy('createdAt', 'desc'));
      const unsubPay = onSnapshot(payQuery, (paySnap) => {
        const payNotifs = paySnap.docs.slice(0, 5).map(d => ({
          id: `pay_${d.id}`, type: 'payment', icon: '💰',
          message: `Payment received from ${d.data().guestName || 'Guest'}`,
          sub: `Room ${d.data().roomNumber || '—'} · ₱${Number(d.data().totalAmount || 0).toLocaleString()}`,
          time: d.data().createdAt?.seconds
            ? new Date(d.data().createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          path: '/admin/payments',
        }));

        const unsubMsg = onSnapshot(
          query(collection(db, 'conversations'), where('unread', '==', true)),
          (msgSnap) => {
            const msgNotifs = msgSnap.docs.slice(0, 3).map(d => ({
              id: `msg_${d.id}`, type: 'message', icon: '💬',
              message: `New message from ${d.data().guestName || 'Guest'}`,
              sub: d.data().lastMessage || 'New message',
              time: d.data().lastMessageAt?.seconds
                ? new Date(d.data().lastMessageAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Just now',
              path: '/admin/messages',
            }));
            const all = [...resNotifs, ...payNotifs, ...msgNotifs].slice(0, 10);
            setNotifications(all);
            setUnread(all.length);
          }
        );
        return () => unsubMsg();
      });
      return () => unsubPay();
    });
    return () => unsubRes();
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <motion.button
        onClick={() => setOpen(p => !p)}
        variants={btnVariants}
        initial="rest"
        whileHover="hover"
        animate="rest"
        transition={expandTransition}
        style={{
          position: 'relative',
          height: '38px',
          borderRadius: '10px',
          border: `1px solid ${BTN_BORDER}`,
          background: BTN_BG,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', overflow: 'hidden',
        }}
      >
        <i className="ti ti-bell" style={{ fontSize: '18px', color: TEXT, flexShrink: 0 }} />
        <AnimatePresence initial={false}>
          <motion.span
            variants={labelVariants}
            initial="initial"
            whileHover="animate"
            exit="exit"
            transition={expandTransition}
            style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 600, color: TEXT }}
          >
            Alerts
          </motion.span>
        </AnimatePresence>
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
              <div style={{ fontWeight: '700', fontSize: '14px', color: TEXT, fontFamily: "'Poppins', sans-serif" }}>
                🔔 Notifications
                {unread > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '10px', padding: '1px 7px', marginLeft: '6px' }}>{unread}</span>
                )}
              </div>
              <span style={{ fontSize: '11px', color: ACCENT, fontWeight: '600', cursor: 'pointer' }} onClick={() => setOpen(false)}>Close</span>
            </div>

            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: MUTED, fontSize: '12px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>No new notifications
                </div>
              ) : notifications.map((n, i) => (
                <div key={n.id} onClick={() => { setOpen(false); window.location.href = n.path; }}
                  style={{
                    padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
                    cursor: 'pointer', background: i % 2 === 0 ? ROW_A : ROW_B,
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = ROW_HOVER}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? ROW_A : ROW_B}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: ICON_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                    {n.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT }}>{n.message}</div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</div>
                    <div style={{ fontSize: '10px', color: FAINT, marginTop: '3px' }}>{n.time}</div>
                  </div>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ACCENT, flexShrink: 0, marginTop: '4px' }} />
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { label: '📋 Bookings', path: '/admin/reservations', bg: 'rgba(200,240,110,0.1)', color: '#8fb83a' },
                { label: '💰 Payments', path: '/admin/payments',     bg: 'rgba(251,191,36,0.1)',  color: '#d97706' },
                { label: '💬 Messages', path: '/admin/messages',     bg: 'rgba(167,139,250,0.1)', color: '#7c5ce0' },
              ].map(b => (
                <button key={b.label} onClick={() => { setOpen(false); window.location.href = b.path; }}
                  style={{ background: b.bg, color: b.color, border: `1px solid ${b.color}22`, borderRadius: '8px', padding: '10px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
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
  const { settings } = useSettings();
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const current = window.location.pathname;

  const dark = settings?.darkMode;

  // Sidebar always starts collapsed to an icon rail and expands automatically
  // while the mouse is over it, matching the reference hover-to-expand sidebar.
  const [hovered, setHovered] = useState(false);
  const collapsed = !hovered;

  // When dark mode is OFF use clean light theme, when ON use the new dark palette
  const SIDEBAR_BG   = dark ? '#1c1c1c'  : '#ffffff';
  const SIDEBAR_TEXT = dark ? '#e8e8d8'  : '#111827';
  const TOPBAR_BG    = dark ? '#1c1c1c'  : '#ffffff';
  const BG           = dark ? '#020b09'  : '#f4f6f4';
  const BORDER       = dark ? '#282827'  : '#f0f0f0';
  const NAV_TEXT     = dark ? '#8a8a7a'  : '#6b7280';
  const NAV_HOVER    = dark ? '#282827'  : '#f3f4f6';
  const ACCENT       = settings?.accentColor || '#c8f06e';
  const ACCENT_TEXT  = '#0a1a0a';
  const MUTED        = dark ? '#5a5a4a'  : '#9ca3af';
  const sidebarWidth = collapsed ? '64px' : '210px';

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
        window.location.href = '/';
      }
    });

    const msgsQuery = query(collection(db, 'conversations'), where('unread', '==', true));
    const unsubMsgs = onSnapshot(msgsQuery, snap => setUnreadCount(snap.size));

    return () => { unsubscribe(); unsubMsgs(); };
  }, []);

  const handleLogout = async () => { await signOut(auth); window.location.href = '/'; };

  const initials = adminName
    ? adminName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'A';

  const currentLabel = navItems.find(n => n.path === current)?.label || 'Dashboard';

  const navButtonStyle = (isActive) => ({
    width: '100%', display: 'flex', alignItems: 'center',
    gap: collapsed ? '0' : '9px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '10px 0' : '8px 10px',
    borderRadius: '8px', marginBottom: '1px',
    border: 'none', cursor: 'pointer',
    fontSize: '12.5px', fontFamily: "'Poppins', sans-serif",
    background: isActive ? ACCENT : 'transparent',
    color: isActive ? ACCENT_TEXT : NAV_TEXT,
    fontWeight: isActive ? '600' : '400',
    transition: 'all 0.15s', textAlign: 'left',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Poppins', sans-serif", background: BG }}>

      {/* ── Sidebar ── */}
      <motion.aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={{
        minHeight: '100vh',
        background: SIDEBAR_BG,
        borderRight: `1px solid ${BORDER}`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', left: 0, top: 0, zIndex: 100,
        boxShadow: dark ? '2px 0 20px rgba(0,0,0,0.4)' : '2px 0 8px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{
          padding: collapsed ? '18px 0' : '22px 16px 18px',
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: '10px', borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <svg width="26" height="34" viewBox="0 0 36 44" fill="none" style={{ flexShrink: 0 }}>
              {/* dirty white bamboo logo */}
              <rect x="4"  y="0"  width="5"  height="44" rx="2.5" fill="#d4d4c4"/>
              <rect x="4"  y="8"  width="8"  height="3"  rx="1.5" fill="#d4d4c4" opacity="0.6"/>
              <rect x="4"  y="20" width="10" height="3"  rx="1.5" fill="#d4d4c4" opacity="0.6"/>
              <rect x="4"  y="32" width="7"  height="3"  rx="1.5" fill="#d4d4c4" opacity="0.6"/>
              <rect x="14" y="4"  width="5"  height="40" rx="2.5" fill="#d4d4c4" opacity="0.8"/>
              <rect x="14" y="12" width="9"  height="3"  rx="1.5" fill="#d4d4c4" opacity="0.5"/>
              <rect x="14" y="24" width="11" height="3"  rx="1.5" fill="#d4d4c4" opacity="0.5"/>
              <rect x="25" y="2"  width="4"  height="38" rx="2"   fill="#d4d4c4" opacity="0.6"/>
              <rect x="25" y="14" width="8"  height="2.5" rx="1.25" fill="#d4d4c4" opacity="0.4"/>
              <rect x="25" y="26" width="9"  height="2.5" rx="1.25" fill="#d4d4c4" opacity="0.4"/>
            </svg>
            <motion.div
              animate={{
                display: collapsed ? 'none' : 'block',
                opacity: collapsed ? 0 : 1,
              }}
              transition={{ duration: 0.15 }}
              style={{ minWidth: 0, whiteSpace: 'nowrap' }}
            >
              <div style={{ color: dark ? '#d4d4c4' : '#111827', fontWeight: '700', fontSize: '12px', lineHeight: 1.2 }}>Lawiswis Kawayan</div>
              <div style={{ color: dark ? '#c8f06e' : '#8fb83a', fontSize: '8.5px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: '600' }}>Garden Resort</div>
              <div style={{ color: MUTED, fontSize: '8px', marginTop: '1px' }}>HuaPro Admin</div>
            </motion.div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const isActive = current === item.path;
            return (
              <button key={item.label}
                onClick={() => window.location.href = item.path}
                title={collapsed ? item.label : ''}
                style={navButtonStyle(isActive)}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = NAV_HOVER; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: '16px', flexShrink: 0, color: isActive ? ACCENT_TEXT : NAV_TEXT }} />
                <motion.span
                  animate={{
                    display: collapsed ? 'none' : 'inline-block',
                    opacity: collapsed ? 0 : 1,
                  }}
                  transition={{ duration: 0.15 }}
                  style={{ flex: 1, whiteSpace: 'nowrap', textAlign: 'left' }}
                >
                  {item.label}
                </motion.span>
              </button>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{
          padding: collapsed ? '14px 0' : '14px 12px',
          borderTop: `1px solid ${BORDER}`,
        }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', background: ACCENT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '12px', color: ACCENT_TEXT, flexShrink: 0,
              }}>{initials}</div>
              <motion.div
                animate={{
                  display: collapsed ? 'none' : 'block',
                  opacity: collapsed ? 0 : 1,
                }}
                transition={{ duration: 0.15 }}
                style={{ minWidth: 0 }}
              >
                <div style={{ color: SIDEBAR_TEXT, fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminName || 'Admin'}</div>
                <div style={{ color: MUTED, fontSize: '10px', textTransform: 'capitalize' }}>{adminRole}</div>
              </motion.div>
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
            gap: '6px', transition: 'background 0.12s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = NAV_HOVER}
            onMouseLeave={e => e.currentTarget.style.background = dark ? '#282827' : '#fff'}
          >
            <i className="ti ti-logout" style={{ fontSize: '14px' }} />
            <motion.span
              animate={{
                display: collapsed ? 'none' : 'inline-block',
                opacity: collapsed ? 0 : 1,
              }}
              transition={{ duration: 0.15 }}
              style={{ whiteSpace: 'nowrap' }}
            >
              Sign out
            </motion.span>
          </button>
        </div>
      </motion.aside>

      {/* ── Main area ── */}
      <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', transition: 'margin-left 0.2s' }}>

        {/* Topbar */}
        <header style={{
          background: TOPBAR_BG,
          borderBottom: `1px solid ${BORDER}`,
          padding: '0 28px', height: '60px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, zIndex: 99,
          boxShadow: dark ? '0 1px 20px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div>
            <div style={{ fontWeight: '600', fontSize: '17px', color: SIDEBAR_TEXT }}>{currentLabel}</div>
            <div style={{ fontSize: '11px', color: MUTED }}>HuaPro Resort Management System</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ExpandableIconButton
              icon="ti-settings"
              label="Settings"
              dark={dark}
              onClick={() => window.location.href = '/admin/settings'}
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
                <div style={{ fontWeight: '600', fontSize: '13px', color: SIDEBAR_TEXT }}>{adminName || 'Admin'}</div>
                <div style={{ fontSize: '11px', color: MUTED, textTransform: 'capitalize' }}>{adminRole}</div>
              </div>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px', background: BG }}>
          {children}
        </main>
      </div>

      {/* Slide-in Messages panel */}
      <ChatPanel dark={dark} accent={ACCENT} open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}