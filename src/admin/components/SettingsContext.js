import React, { createContext, useContext, useState, useEffect } from 'react';

const STORAGE_KEY = 'lkgr_admin_settings';

const DEFAULT_SETTINGS = {
  darkMode: false,
  compactSidebar: false,
  fontSize: 'medium',
  accentColor: '#c8f06e',
  language: 'en',
  timezone: 'Asia/Manila',
  currency: 'PHP',
  dateFormat: 'MM/DD/YYYY',
  notifications: true,
  soundAlerts: false,
  emailAlerts: true,
  autoLogout: '30',
  showRevenue: true,
  showOccupancy: true,
  twoFactor: false,
  sessionTimeout: true,
};

function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  const updateSetting = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const saveAll = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
  };

  // Apply settings globally
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Dark mode
    if (settings.darkMode) {
      body.style.background = '#0f1f0f';
      root.setAttribute('data-dark', 'true');
    } else {
      body.style.background = '';
      root.removeAttribute('data-dark');
    }

    // Font size
    const sizeMap = { small: '12px', medium: '14px', large: '16px' };
    root.style.fontSize = sizeMap[settings.fontSize] || '14px';

    // Accent color CSS variable
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-dark', '#1a3a1a');

  }, [settings.darkMode, settings.fontSize, settings.accentColor]);

  // Convert any Firestore Timestamp, string, or Date into a JS Date
  const toJsDate = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate(); // Firestore Timestamp
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    try {
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: settings.currency || 'PHP',
        minimumFractionDigits: 2,
      }).format(num);
    } catch {
      return `₱${num.toFixed(2)}`;
    }
  };

  const formatDate = (value, options) => {
    const date = toJsDate(value);
    if (!date) return '—';

    // Respect dateFormat setting (MM/DD/YYYY vs DD/MM/YYYY vs YYYY-MM-DD etc.)
    if (!options && settings.dateFormat) {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();

      switch (settings.dateFormat) {
        case 'DD/MM/YYYY':
          return `${dd}/${mm}/${yyyy}`;
        case 'YYYY-MM-DD':
          return `${yyyy}-${mm}-${dd}`;
        case 'MM/DD/YYYY':
        default:
          return `${mm}/${dd}/${yyyy}`;
      }
    }

    return date.toLocaleDateString('en-PH', options || {
      year: 'numeric', month: 'short', day: 'numeric',
      timeZone: settings.timezone || 'Asia/Manila',
    });
  };

  const formatDateTime = (value) => {
    const date = toJsDate(value);
    if (!date) return '—';
    return date.toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: settings.timezone || 'Asia/Manila',
    });
  };

  return (
    <SettingsContext.Provider value={{
      settings, updateSetting, saveAll, reset,
      formatCurrency, formatDate, formatDateTime,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

export default SettingsContext;