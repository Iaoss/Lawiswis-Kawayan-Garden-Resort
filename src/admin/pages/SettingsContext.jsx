import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db } from '../../firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const DEFAULT_SETTINGS = {
  darkMode:       false,
  compactSidebar: false,
  fontSize:       'medium',
  accentColor:    '#c8f06e',
  currency:       'PHP',
  dateFormat:     'MM/DD/YYYY',
  notifications:  true,
  soundAlerts:    false,
  emailAlerts:    true,
  autoLogout:     '30',
  sessionTimeout: true,
  showRevenue:    true,
  showOccupancy:  true,
  showReservations: true,
  showChart:      true,
};

// Fast local cache, keyed per-uid so different accounts on the same
// browser never collide. This is ONLY used to avoid a flash of the
// wrong theme before Firestore responds — Firestore is the source of truth.
function loadCache(uid) {
  if (!uid) return { ...DEFAULT_SETTINGS };
  try {
    const s = localStorage.getItem(`lkgr_settings_${uid}`);
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveCache(uid, settings) {
  if (!uid) return;
  try { localStorage.setItem(`lkgr_settings_${uid}`, JSON.stringify(settings)); } catch {}
}

export const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [uid, setUid] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const uidRef = useRef(null);

  // ── Load the correct user's settings whenever auth state changes ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        uidRef.current = null;
        setUid(null);
        setSettings({ ...DEFAULT_SETTINGS });
        setLoaded(true);
        return;
      }

      uidRef.current = user.uid;
      setUid(user.uid);

      // Fast paint from local cache first
      setSettings(loadCache(user.uid));

      // Then confirm/correct from Firestore
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const stored = snap.exists() ? snap.data().settings : null;
        const resolved = { ...DEFAULT_SETTINGS, ...(stored || {}) };
        setSettings(resolved);
        saveCache(user.uid, resolved);
      } catch (err) {
        console.warn('Failed to load user settings:', err.message);
      } finally {
        setLoaded(true);
      }
    });
    return unsub;
  }, []);

  const persist = async (next) => {
    setSettings(next);
    const currentUid = uidRef.current;
    if (!currentUid) return; // not logged in, nothing to persist
    saveCache(currentUid, next);
    try {
      await setDoc(doc(db, 'users', currentUid), { settings: next }, { merge: true });
    } catch (err) {
      console.warn('Failed to save settings:', err.message);
    }
  };

  const updateSetting = (key, value) => {
    persist({ ...settings, [key]: value });
  };

  const saveAll = (s) => {
    persist(s);
  };

  const resetAll = () => {
    persist({ ...DEFAULT_SETTINGS });
  };

  // ── Dark Mode ──
  useEffect(() => {
    const root = document.documentElement;
    if (settings.darkMode) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
  }, [settings.darkMode]);

  // ── Accent Color ──
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    document.documentElement.style.setProperty('--accent-dark', '#1a3a1a');
  }, [settings.accentColor]);

  // ── Font Size ──
  useEffect(() => {
    const map = { small: '13px', medium: '15px', large: '17px' };
    document.documentElement.style.setProperty('--base-font', map[settings.fontSize] || '15px');
  }, [settings.fontSize]);

  // ── Auto Logout ──
  useEffect(() => {
    if (settings.autoLogout === 'never') return;
    const ms = Number(settings.autoLogout) * 60 * 1000;
    let timer;
    let warnTimer;

    const reset = () => {
      clearTimeout(timer);
      clearTimeout(warnTimer);

      if (settings.sessionTimeout && settings.autoLogout !== 'never') {
        warnTimer = setTimeout(() => {
          if (window.confirm('⏱ You will be logged out in 1 minute due to inactivity. Stay logged in?')) {
            reset();
          }
        }, ms - 60000);
      }

      timer = setTimeout(() => {
        import('firebase/auth').then(({ getAuth, signOut }) => {
          signOut(getAuth()).finally(() => { window.location.href = '/'; });
        });
      }, ms);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset));
    reset();

    return () => {
      clearTimeout(timer);
      clearTimeout(warnTimer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [settings.autoLogout, settings.sessionTimeout]);

  const formatCurrency = (amount) => {
    const symbols = { PHP: '₱', USD: '$' };
    const sym = symbols[settings.currency] || '₱';
    return `${sym}${Number(amount).toLocaleString()}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    switch (settings.dateFormat) {
      case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
      case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
      default:           return `${mm}/${dd}/${yyyy}`;
    }
  };

  return (
    <SettingsContext.Provider value={{
      settings, updateSetting, saveAll, resetAll,
      formatCurrency, formatDate, settingsLoaded: loaded,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);