import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, db } from '../../firebase/firebase';

// The staff check needs Firebase to restore the login and read the user's
// role, which takes a moment on every page load. The last confirmed result is
// remembered for this browser tab, so pages show straight away while the
// check runs again in the background. If it fails, the user is redirected as
// before. (Data is still protected by Firestore rules and server checks.)
const SESSION_KEY = 'lkgr_staff_access';
let lastConfirmed = null; // { uid, role } for this tab

function readRememberedRole() {
  if (lastConfirmed) return lastConfirmed.role;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
    return saved && typeof saved.role === 'string' ? saved.role : null;
  } catch {
    return null;
  }
}

function rememberAccess(uid, role) {
  lastConfirmed = role ? { uid, role } : null;
  try {
    if (role) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role }));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable; the check just runs each time */ }
}

// Forget the remembered access as soon as anyone signs out (from any page).
onAuthStateChanged(auth, user => { if (!user) rememberAccess(null, null); });

export default function RequireStaffRoute({ children, allowedRoles = ['admin', 'receptionist'] }) {
  const location = useLocation();
  const [access, setAccess] = useState(() => {
    const remembered = readRememberedRole();
    return remembered ? { loading: false, role: remembered } : { loading: true, role: null };
  });

  useEffect(() => {
    let active = true;
    let latestAuthCheck = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const authCheck = ++latestAuthCheck;
      if (!user) {
        rememberAccess(null, null);
        if (active && authCheck === latestAuthCheck) setAccess({ loading: false, role: null });
        return;
      }

      try {
        const userSnapshot = await getDoc(doc(db, 'users', user.uid));
        const data = userSnapshot.exists() ? userSnapshot.data() : {};
        const role = String(data.role || '').trim().toLowerCase();
        const status = String(data.status || 'active').trim().toLowerCase();
        const confirmedRole = status === 'inactive' || !['admin', 'receptionist'].includes(role) ? null : role;
        rememberAccess(user.uid, confirmedRole);
        if (active && authCheck === latestAuthCheck) setAccess({ loading: false, role: confirmedRole });
      } catch {
        rememberAccess(null, null);
        if (active && authCheck === latestAuthCheck) setAccess({ loading: false, role: null });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // First sign-in check only (later pages use the remembered result): a
  // plain background, no loading skeleton.
  if (access.loading) {
    return <main aria-busy="true" style={{ minHeight: '100vh', background: 'var(--admin-bg, #f4f6f4)' }} />;
  }

  if (!access.role) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(access.role)) {
    return <Navigate to={access.role === 'receptionist' ? '/receptionist/dashboard' : '/admin/dashboard'} replace />;
  }

  return children;
}