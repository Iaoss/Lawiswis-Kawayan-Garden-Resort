import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, db } from '../../firebase/firebase';

export default function RequireStaffRoute({ children, allowedRoles = ['admin', 'receptionist'] }) {
  const location = useLocation();
  const [access, setAccess] = useState({ loading: true, role: null });

  useEffect(() => {
    let active = true;
    let latestAuthCheck = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const authCheck = ++latestAuthCheck;
      if (!user) {
        if (active && authCheck === latestAuthCheck) setAccess({ loading: false, role: null });
        return;
      }

      try {
        const userSnapshot = await getDoc(doc(db, 'users', user.uid));
        const data = userSnapshot.exists() ? userSnapshot.data() : {};
        const role = String(data.role || '').trim().toLowerCase();
        const status = String(data.status || 'active').trim().toLowerCase();
        if (active && authCheck === latestAuthCheck) setAccess({ loading: false, role: status === 'inactive' ? null : role });
      } catch {
        if (active && authCheck === latestAuthCheck) setAccess({ loading: false, role: null });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (access.loading) {
    return (
      <main role="status" aria-live="polite" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f6f4', color: '#374151', fontFamily: "'Poppins', sans-serif", fontSize: '14px' }}>
        Verifying staff access...
      </main>
    );
  }

  if (!access.role) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(access.role)) {
    return <Navigate to={access.role === 'receptionist' ? '/receptionist/dashboard' : '/admin/dashboard'} replace />;
  }

  return children;
}