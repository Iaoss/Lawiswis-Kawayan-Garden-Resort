import React, { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

const DEFAULT_SETTINGS = {
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

const ACCENT_COLORS = [
  { label: 'Lime',   value: '#c8f06e' },
  { label: 'Teal',   value: '#5eead4' },
  { label: 'Blue',   value: '#60a5fa' },
  { label: 'Purple', value: '#c084fc' },
  { label: 'Orange', value: '#fb923c' },
  { label: 'Pink',   value: '#f472b6' },
];

const TABS = [
  { id: 'appearance',    label: 'Appearance',    icon: '🎨' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'regional',      label: 'Regional',      icon: '🌏' },
  { id: 'security',      label: 'Security',      icon: '🔒' },
  { id: 'dashboard',     label: 'Dashboard',     icon: '📊' },
];

export default function Settings() {
  const { settings, updateSetting, saveAll, resetAll, settingsLoaded } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens ──
  const ACCENT      = settings?.accentColor || '#c8f06e';
  const ACCENT_TEXT = '#0a1a0a';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f4f6f4';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#111827';
  const SUBTEXT = dark ? '#c7c7c0' : '#6b7280';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const DARKBTN_BG   = dark ? '#282827' : '#1a3a1a';
  const ERROR_BG      = dark ? '#7f1d1d' : '#fef2f2';
  const ERROR_BORDER  = dark ? '#991b1b' : '#fecaca';
  const ERROR_TEXT    = dark ? '#fca5a5' : '#991b1b';

  const [local, setLocal] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');

  // Keep local (staged) state in sync once the real per-user settings
  // finish loading from Firestore — without this, tabs other than
  // Appearance could show stale defaults after async load completes.
  useEffect(() => {
    if (settingsLoaded) {
      setLocal({ ...DEFAULT_SETTINGS, ...settings });
    }
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, value) => setLocal(prev => ({ ...prev, [key]: value }));

  const playSoundPreview = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.18);
    } catch (error) {
      // Ignore playback errors when the browser blocks audio.
    }
  };

  // Appearance settings apply immediately for live preview
  const setLive = (key, value) => {
    set(key, value);
    updateSetting(key, value);
  };

  const handleSave = () => {
    saveAll({ ...settings, ...local });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings to default?')) {
      setLocal({ ...DEFAULT_SETTINGS });
      resetAll();
    }
  };

  function Toggle({ value, onChange }) {
    return (
      <div onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 999, cursor: 'pointer',
          background: value ? DARKBTN_BG : (dark ? '#3a3a38' : '#e5e7eb'),
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: value ? ACCENT : '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s, background 0.2s',
        }} />
      </div>
    );
  }

  function SettingRow({ icon, label, desc, children }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: CARD2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{label}</div>
            {desc && <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{desc}</div>}
          </div>
        </div>
        <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
      </div>
    );
  }

  function Section({ title, children }) {
    return (
      <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '4px 20px 4px', marginBottom: 16, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : 'none' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 0 8px' }}>
          {title}
        </div>
        {children}
      </div>
    );
  }

  const selectStyle = {
    border: `1px solid ${BORDER}`, borderRadius: 8,
    padding: '6px 10px', fontSize: 12,
    fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
    background: CARD2, color: TEXT,
  };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0 }}>Settings</h2>
              <p style={{ fontSize: 12, color: SUBTEXT, margin: '4px 0 0' }}>Manage your preferences</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleReset}
                style={{ padding: '8px 16px', border: `1px solid ${BORDER}`, borderRadius: 10, background: CARD, color: SUBTEXT, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Reset Defaults
              </button>
              <button onClick={handleSave}
                style={{ padding: '8px 20px', border: 'none', borderRadius: 10, background: ACCENT, color: ACCENT_TEXT, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saved ? '✓ Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: CARD2, borderRadius: 12, padding: 4 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1, padding: '8px 4px', border: 'none', borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11, fontWeight: activeTab === t.id ? 700 : 400,
                  background: activeTab === t.id ? CARD : 'transparent',
                  color: activeTab === t.id ? TEXT : SUBTEXT,
                  boxShadow: activeTab === t.id ? (dark ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.08)') : 'none',
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* ── APPEARANCE ── */}
          {activeTab === 'appearance' && (
            <>
              <Section title="Theme">
                <SettingRow icon="🌙" label="Dark Mode" desc="Switch the panel to a dark theme">
                  <Toggle value={settings.darkMode} onChange={v => setLive('darkMode', v)} />
                </SettingRow>
                <SettingRow icon="📐" label="Compact Sidebar" desc="Reduce sidebar width to show only icons">
                  <Toggle value={settings.compactSidebar} onChange={v => setLive('compactSidebar', v)} />
                </SettingRow>
              </Section>

              <Section title="Accent Color">
                <div style={{ padding: '12px 0 16px' }}>
                  <div style={{ fontSize: 12, color: SUBTEXT, marginBottom: 12 }}>Choose the highlight color used across the panel</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {ACCENT_COLORS.map(c => (
                      <div key={c.value} onClick={() => setLive('accentColor', c.value)}
                        style={{ textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: c.value,
                          border: settings.accentColor === c.value ? `3px solid ${TEXT}` : `2px solid ${BORDER}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {settings.accentColor === c.value && <span style={{ fontSize: 16, color: ACCENT_TEXT }}>✓</span>}
                        </div>
                        <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Text Size">
                <div style={{ padding: '12px 0 16px' }}>
                  <div style={{ fontSize: 12, color: SUBTEXT, marginBottom: 12 }}>Adjust the base font size of the panel</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['small', 'medium', 'large'].map(size => (
                      <button key={size} onClick={() => setLive('fontSize', size)}
                        style={{
                          flex: 1, padding: '10px', border: settings.fontSize === size ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                          borderRadius: 10, background: settings.fontSize === size ? CARD2 : CARD,
                          fontSize: size === 'small' ? 11 : size === 'medium' ? 13 : 15,
                          fontWeight: settings.fontSize === size ? 700 : 400,
                          cursor: 'pointer', fontFamily: 'inherit', color: TEXT,
                          textTransform: 'capitalize',
                        }}>
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeTab === 'notifications' && (
            <Section title="Alert Preferences">
              <SettingRow icon="🔔" label="Push Notifications" desc="Show in-app bell alerts for new bookings and messages">
                <Toggle value={local.notifications} onChange={v => set('notifications', v)} />
              </SettingRow>
              <SettingRow icon="🔊" label="Sound Alerts" desc="Play a sound when a new notification arrives">
                <Toggle value={local.soundAlerts} onChange={v => {
                  set('soundAlerts', v);
                  if (v) playSoundPreview();
                }} />
              </SettingRow>
              <SettingRow icon="📧" label="Email Alerts" desc="Receive an email for new online bookings">
                <Toggle value={local.emailAlerts} onChange={v => set('emailAlerts', v)} />
              </SettingRow>
            </Section>
          )}

          {/* ── REGIONAL ── */}
          {activeTab === 'regional' && (
            <Section title="Locale & Format">
              <SettingRow icon="💱" label="Currency" desc="Currency shown in billing and reports">
                <select value={local.currency} onChange={e => set('currency', e.target.value)} style={selectStyle}>
                  <option value="PHP">PHP — Philippine Peso (₱)</option>
                  <option value="USD">USD — US Dollar ($)</option>
                </select>
              </SettingRow>
              <SettingRow icon="📅" label="Date Format" desc="How dates appear across the system">
                <select value={local.dateFormat} onChange={e => set('dateFormat', e.target.value)} style={selectStyle}>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </SettingRow>
            </Section>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (
            <>
              <Section title="Access & Session">
                <SettingRow icon="⏱" label="Auto Logout" desc="Automatically sign out after inactivity">
                  <select value={local.autoLogout} onChange={e => set('autoLogout', e.target.value)} style={selectStyle}>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                    <option value="never">Never</option>
                  </select>
                </SettingRow>
                <SettingRow icon="🔄" label="Session Timeout Warning" desc="Show a warning before auto logout">
                  <Toggle value={local.sessionTimeout} onChange={v => set('sessionTimeout', v)} />
                </SettingRow>
              </Section>

              <Section title="Danger Zone">
                <div style={{ padding: '14px 0' }}>
                  <div style={{ background: ERROR_BG, border: `1px solid ${ERROR_BORDER}`, borderRadius: 12, padding: '16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: ERROR_TEXT, marginBottom: 4 }}>Clear Local Cache</div>
                    <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Clears the local settings cache on this device. Does not delete any Firebase data.</div>
                    <button onClick={() => { localStorage.clear(); alert('Cache cleared. Reloading...'); window.location.reload(); }}
                      style={{ padding: '7px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Clear Cache
                    </button>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <Section title="Visible Widgets">
              <SettingRow icon="💰" label="Show Total Revenue" desc="Display revenue card on the dashboard">
                <Toggle value={local.showRevenue} onChange={v => set('showRevenue', v)} />
              </SettingRow>
              <SettingRow icon="🛏" label="Show Occupancy Rate" desc="Display room occupancy card on the dashboard">
                <Toggle value={local.showOccupancy} onChange={v => set('showOccupancy', v)} />
              </SettingRow>
              <SettingRow icon="📋" label="Show Recent Reservations" desc="Display the latest bookings list">
                <Toggle value={local.showReservations} onChange={v => set('showReservations', v)} />
              </SettingRow>
              <SettingRow icon="📊" label="Show Revenue Chart" desc="Display the 6-month revenue chart">
                <Toggle value={local.showChart} onChange={v => set('showChart', v)} />
              </SettingRow>
            </Section>
          )}

          {/* Save bar */}
          {saved && (
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: ACCENT, color: ACCENT_TEXT, borderRadius: 12, padding: '12px 28px', fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', gap: 8 }}>
              ✓ Settings saved successfully
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}