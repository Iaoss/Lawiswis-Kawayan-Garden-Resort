import React, { createContext, useContext, useState, useEffect } from 'react';

const STORAGE_KEY = 'lkgr_admin_settings';

export const DEFAULT_SETTINGS = {
  darkMode: false,
  compactSidebar: false,
  fontSize: 'medium',
  accentColor: '#9cb56f',
  language: 'en',
  timezone: 'Asia/Manila',
  currency: 'PHP',
  dateFormat: 'MM/DD/YYYY',
  notifications: true,
  soundAlerts: false,
  emailAlerts: true,
  autoLogout: '30',
  showTotalRevenue: true,
  showOccupancyRate: true,
  showRecentReservations: true,
  showRevenueChart: true,
  twoFactor: false,
  sessionTimeout: true,
};

export const DASHBOARD_KEYS = ['showTotalRevenue', 'showOccupancyRate', 'showRecentReservations', 'showRevenueChart'];

const LEGACY_KEYS = {
  showRevenue: 'showTotalRevenue',
  showOccupancy: 'showOccupancyRate',
  showReservations: 'showRecentReservations',
  showChart: 'showRevenueChart',
};

function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(s);
    Object.entries(LEGACY_KEYS).forEach(([oldKey, newKey]) => {
      if (oldKey in parsed) {
        if (!(newKey in parsed)) parsed[newKey] = parsed[oldKey];
        delete parsed[oldKey];
      }
    });
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch { return DEFAULT_SETTINGS; }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    setSettings(load());
    setSettingsLoaded(true);
  }, []);

  const updateSetting = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const saveAll = (newSettings) => {
    const next = { ...DEFAULT_SETTINGS, ...newSettings };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const resetAll = () => {
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
    // Most pages use fixed px inline styles, so scale the whole document with zoom
    const zoomMap = { small: '0.9', medium: '1', large: '1.12' };
    root.style.fontSize = '';
    root.style.zoom = zoomMap[settings.fontSize] || '1';
    root.setAttribute('data-text-size', settings.fontSize || 'medium');

    // Accent color CSS variable
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-dark', '#1a3a1a');

  }, [settings.darkMode, settings.fontSize, settings.accentColor]);

  // Convert any Firestore Timestamp, string, or Date into a JS Date
  const toJsDate = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate(); // Firestore Timestamp
    // Parse plain YYYY-MM-DD as a local date to avoid timezone shifts
    const plain = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const d = plain ? new Date(+plain[1], +plain[2] - 1, +plain[3]) : new Date(value);
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
    const time = date.toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit',
      timeZone: settings.timezone || 'Asia/Manila',
    });
    return `${formatDate(date)} ${time}`;
  };

  return (
    <SettingsContext.Provider value={{
      settings, updateSetting, saveAll, resetAll,
      formatCurrency, formatDate, formatDateTime,
      settingsLoaded,
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