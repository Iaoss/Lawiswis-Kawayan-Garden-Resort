import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { DEFAULT_EXTRA_FEES, normalizeExtraFees } from '../../lib/extraFees';

// The resort's common fees (settings/extraFees), read once per visit.
let cached = null;
const listeners = new Set();

export function setCachedExtraFees(fees) {
  cached = fees;
  listeners.forEach(listener => listener(fees));
}

export function useExtraFees() {
  const [fees, setFees] = useState(cached || DEFAULT_EXTRA_FEES);
  useEffect(() => {
    listeners.add(setFees);
    if (!cached) {
      getDoc(doc(db, 'settings', 'extraFees'))
        .then(snapshot => setCachedExtraFees((snapshot.exists() && normalizeExtraFees(snapshot.data())) || DEFAULT_EXTRA_FEES))
        .catch(() => { /* keep the default list */ });
    }
    return () => { listeners.delete(setFees); };
  }, []);
  return fees;
}
