import { useEffect, useState } from 'react';
import { applyCottageCatalog, getCottageCatalogVersion } from './bookingPricing';

// Loads the admin's cottage list once per visit and applies it to the shared
// price list (COTTAGE_OPTIONS). Pages that show cottages call this hook so
// they redraw when the list arrives or an admin changes it.
const listeners = new Set();
let pending = null;

const notify = () => listeners.forEach(listener => listener(getCottageCatalogVersion()));

export function loadCottageCatalogOnce() {
  if (!pending && typeof fetch === 'function') {
    pending = fetch('/api/cottage-types')
      .then(response => (response.ok ? response.json() : { cottages: null }))
      .then(result => { if (result.cottages) { applyCottageCatalog({ cottages: result.cottages }); notify(); } })
      .catch(() => { pending = null; });
  }
  return pending || Promise.resolve();
}

// After an admin saves a new list: use it straight away on this page.
export function applySavedCottageCatalog(cottages) {
  if (applyCottageCatalog({ cottages })) notify();
}

export function useCottageCatalog() {
  const [version, setVersion] = useState(getCottageCatalogVersion);
  useEffect(() => {
    listeners.add(setVersion);
    loadCottageCatalogOnce();
    return () => listeners.delete(setVersion);
  }, []);
  return version;
}
