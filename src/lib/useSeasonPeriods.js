import { useEffect, useState } from 'react';

// Holiday / peak-season periods for showing prices before booking (the
// server recalculates the real price). Loaded once per visit.
let cache = null;
let pending = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/api/seasonal-rates')
      .then(response => (response.ok ? response.json() : { periods: [] }))
      .then(result => { cache = Array.isArray(result.periods) ? result.periods : []; return cache; })
      .catch(() => { pending = null; return []; });
  }
  return pending;
}

export function useSeasonPeriods() {
  const [periods, setPeriods] = useState(() => cache || []);
  useEffect(() => {
    let active = true;
    load().then(list => { if (active) setPeriods(list); });
    return () => { active = false; };
  }, []);
  return periods;
}
