import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { DEFAULT_CANCELLATION_POLICY, normalizeCancellationPolicy } from '../../lib/cancellationPolicy';

// The saved cancellation policy (days and percentages), live, for staff screens.
export function useCancellationPolicy() {
  const [policy, setPolicy] = useState(DEFAULT_CANCELLATION_POLICY);
  useEffect(() => onSnapshot(doc(db, 'settings', 'cancellationPolicy'),
    snap => setPolicy(normalizeCancellationPolicy(snap.exists() ? snap.data() : null) || DEFAULT_CANCELLATION_POLICY),
    () => setPolicy(DEFAULT_CANCELLATION_POLICY)), []);
  return policy;
}
