import React, { createContext, useContext, useEffect, useState } from 'react';

const ResortAvailabilityContext = createContext({ available: false, limited: false, reason: '', closedDates: [], error: '', loading: true });

export function ResortAvailabilityProvider({ children }) {
  const [status, setStatus] = useState({ available: false, limited: false, reason: '', closedDates: [], error: '', loading: true });

  useEffect(() => {
    let active = true;
    const loadAvailability = async () => {
      try {
        const response = await fetch('/api/resort-availability');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load resort availability.');
        if (active) setStatus({ available: data.available !== false, limited: data.available !== false && data.limited === true, reason: data.reason || '', closedDates: Array.isArray(data.closedDates) ? data.closedDates : [], error: '', loading: false });
      } catch (error) {
        console.error('Unable to load resort availability:', error);
        if (active) setStatus({
          available: false,
          limited: false,
          reason: '',
          closedDates: [],
          error: error.message || 'Resort availability could not be checked.',
          loading: false,
        });
      }
    };

    loadAvailability();
    // Every 5 minutes while the page is on screen, and when the guest comes back to it.
    const interval = window.setInterval(() => { if (!document.hidden) loadAvailability(); }, 5 * 60000);
    const onVisible = () => { if (!document.hidden) loadAvailability(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <ResortAvailabilityContext.Provider value={status}>
      {children}
    </ResortAvailabilityContext.Provider>
  );
}

export function useResortAvailability() {
  return useContext(ResortAvailabilityContext);
}
