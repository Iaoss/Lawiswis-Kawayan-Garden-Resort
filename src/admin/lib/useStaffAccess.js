import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { getActiveGrants, hasFeature } from '../../lib/staffAccess';

// The signed-in staff member's role and extra access, kept live: a grant
// shows up (or disappears when it's removed or expires) without reloading.
export function useStaffAccess() {
  const [state, setState] = useState({ loading: true, user: null });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopDoc = () => {};
    const stopAuth = onAuthStateChanged(auth, user => {
      stopDoc();
      if (!user) { setState({ loading: false, user: null }); return; }
      stopDoc = onSnapshot(doc(db, 'users', user.uid),
        snapshot => setState({ loading: false, user: snapshot.exists() ? snapshot.data() : null }),
        () => setState({ loading: false, user: null }));
    });
    return () => { stopDoc(); stopAuth(); };
  }, []);

  // Re-check every 30 seconds so temporary access ends on time.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  return {
    loading: state.loading,
    user: state.user,
    can: featureId => hasFeature(state.user, featureId, now),
    grants: getActiveGrants(state.user, now),
  };
}

// Shows the page only to admins and to receptionists with an active grant.
export function RequireFeature({ feature, children }) {
  const { loading, can } = useStaffAccess();
  if (loading) return <main aria-busy="true" style={{ minHeight: '100vh', background: 'var(--admin-bg, #f4f6f4)' }} />;
  if (!can(feature)) return <Navigate to="/receptionist/dashboard" replace state={{ accessEnded: feature }} />;
  return children;
}
