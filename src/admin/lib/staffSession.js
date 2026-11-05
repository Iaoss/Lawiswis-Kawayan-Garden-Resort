import { useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/firebase';
import { dismissToast, pushToast } from './staffToasts';

// Staff session helpers: when the shift started (for the end-of-shift
// summary) and signing out a shared front-desk computer after inactivity.

const SHIFT_KEY = 'lkgr_shift_start';
const ACTIVE_KEY = 'lkgr_last_active';

export function startShift(uid) {
  try { localStorage.setItem(SHIFT_KEY, JSON.stringify({ uid, at: Date.now() })); } catch { /* storage unavailable */ }
}

// When this staff member's shift started: their sign-in, or 6 AM today.
export function getShiftStart(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem(SHIFT_KEY) || 'null');
    if (saved?.uid === uid && Number(saved.at) > Date.now() - 24 * 3600000) return Number(saved.at);
  } catch { /* storage unavailable */ }
  const morning = new Date();
  morning.setHours(6, 0, 0, 0);
  return morning.getTime() > Date.now() ? morning.getTime() - 86400000 : morning.getTime();
}

export async function signOutTo(path = '/admin/login', reason = '') {
  try { localStorage.removeItem(SHIFT_KEY); } catch { /* storage unavailable */ }
  await signOut(auth);
  window.location.href = reason ? `${path}?reason=${encodeURIComponent(reason)}` : path;
}

// Signs the user out after `minutes` without any mouse, keyboard or touch
// activity (in any open tab), with a warning 1 minute before.
export function useIdleLogout({ enabled = true, minutes = 30 }) {
  const warnedRef = useRef('');
  useEffect(() => {
    const limit = Math.max(5, Number(minutes) || 30) * 60000;
    if (!enabled) return undefined;
    const touch = () => {
      try { localStorage.setItem(ACTIVE_KEY, String(Date.now())); } catch { /* storage unavailable */ }
      if (warnedRef.current) { dismissToast(warnedRef.current); warnedRef.current = ''; }
    };
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last > 15000) { last = now; touch(); }
    };
    touch();
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach(name => window.addEventListener(name, onActivity, { passive: true }));
    const timer = setInterval(() => {
      let lastActive = Date.now();
      try { lastActive = Number(localStorage.getItem(ACTIVE_KEY)) || Date.now(); } catch { /* storage unavailable */ }
      const idle = Date.now() - lastActive;
      if (idle >= limit) {
        clearInterval(timer);
        signOutTo('/admin/login', 'idle');
      } else if (idle >= limit - 60000 && !warnedRef.current) {
        warnedRef.current = pushToast({
          id: `idle_${lastActive}`,
          variant: 'warning',
          title: 'Signing you out in 1 minute',
          description: 'No activity for a while. Move the mouse or press a key to stay signed in.',
          sticky: true,
        }) || '';
      }
    }, 10000);
    return () => {
      clearInterval(timer);
      events.forEach(name => window.removeEventListener(name, onActivity));
    };
  }, [enabled, minutes]);
}
