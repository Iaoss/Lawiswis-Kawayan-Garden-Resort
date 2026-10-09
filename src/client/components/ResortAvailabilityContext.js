import React, { createContext, useContext, useEffect, useState } from 'react';

const ResortAvailabilityContext = createContext({ available: false, reason: '', error: '', loading: true });

export function ResortAvailabilityProvider({ children }) {
  const [status, setStatus] = useState({ available: false, reason: '', error: '', loading: true });

  useEffect(() => {
    let active = true;
    const loadAvailability = async () => {
      try {
        const response = await fetch('/api/resort-availability');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load resort availability.');
        if (active) setStatus({ available: data.available !== false, reason: data.reason || '', error: '', loading: false });
      } catch (error) {
        console.error('Unable to load resort availability:', error);
        if (active) setStatus({
          available: false,
          reason: '',
          error: error.message || 'Resort availability could not be checked.',
          loading: false,
        });
      }
    };

    loadAvailability();
    const interval = window.setInterval(loadAvailability, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
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
