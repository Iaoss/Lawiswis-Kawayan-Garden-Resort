import React, { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import { useSettings, DEFAULT_SETTINGS } from '../components/SettingsContext';
// Cancellation is a tab here instead of a sidebar page.
// Adjust the path if your file is named differently.
import Cancellation from './CancellationPolicy';

const ACCENT_COLORS = [
  { label: 'Lime',   value: '#9cb56f' },
  { label: 'Teal',   value: '#5eead4' },
  { label: 'Blue',   value: '#60a5fa' },
  { label: 'Purple', value: '#c084fc' },
  { label: 'Orange', value: '#fb923c' },
  { label: 'Pink',   value: '#f472b6' },
];

const TABS = [
  { id: 'appearance',    label: 'Appearance',    icon: 'ti-palette' },
  { id: 'notifications', label: 'Notifications', icon: 'ti-bell' },
  { id: 'regional',      label: 'Regional',      icon: 'ti-world' },
  { id: 'dashboard',     label: 'Dashboard',     icon: 'ti-layout-dashboard' },
  { id: 'cancellation',  label: 'Cancellation',  icon: 'ti-file-x' },
];

// ── Sub-components live outside the page component so they are not
// redefined (and remounted) on every state change. ──────────────────
function Toggle({ value, onChange, t }) {
  return (
    <div onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 999, cursor: 'pointer',
        background: value ? t.TOGGLE_ON : t.TOGGLE_OFF,
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
      <div style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: value ? t.ACCENT : '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s, background 0.2s',
      }} />
    </div>
  );
}

function SettingRow({ icon, label, desc, children, t, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: last ? 'none' : `1px solid ${t.BORDER}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: t.CARD2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <i className={`ti ${icon}`} style={{ fontSize: 17, color: t.TEXT }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.TEXT }}>{label}</div>
          {desc && <div style={{ fontSize: 11, color: t.MUTED, marginTop: 1 }}>{desc}</div>}
        </div>
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
    </div>
  );
}

function Section({ title, children, t }) {
  return (
    <div style={{
      background: t.CARD, borderRadius: 16, border: `1px solid ${t.BORDER}`,
      padding: '4px 20px', marginBottom: 16,
      boxShadow: t.dark ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.MUTED, textTransform: 'uppercase',
        letterSpacing: '0.08em', padding: '16px 0 8px',
      }}>{title}</div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { settings, updateSetting, saveAll, resetAll, settingsLoaded } = useSettings();
  const dark = !!settings?.darkMode;

  const t = {
    dark,
    ACCENT:     settings?.accentColor || '#9cb56f',
    ACCENT_TEXT:'#0a1a0a',
    BG:         dark ? '#020b09' : '#f4f6f4',
    CARD:       dark ? '#1c1c1c' : '#ffffff',
    CARD2:      dark ? '#282827' : '#f4f6f4',
    BORDER:     dark ? '#2a2a28' : '#e5e7eb',
    TEXT:       dark ? '#f0f0f0' : '#111827',
    SUBTEXT:    dark ? '#c7c7c0' : '#6b7280',
    MUTED:      '#9ca3af',
    TOGGLE_ON:  dark ? '#282827' : '#1a3a1a',
    TOGGLE_OFF: dark ? '#3a3a38' : '#e5e7eb',
  };

  const [local, setLocal] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');

  // Sync staged state once the per-user settings finish loading from Firestore.
  useEffect(() => {
    if (settingsLoaded) setLocal({ ...DEFAULT_SETTINGS, ...settings });
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, value) => setLocal(prev => ({ ...prev, [key]: value }));

  // Appearance changes apply immediately so you can see them.
  const setLive = (key, value) => {
    set(key, value);
    updateSetting(key, value);
  };

  const playSoundPreview = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // Browser blocked audio before the first user gesture.
    }
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

  const selectStyle = {
    border: `1px solid ${t.BORDER}`, borderRadius: 8,
    padding: '6px 10px', fontSize: 12,
    fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
    background: t.CARD2, color: t.TEXT,
  };

  const isCancellation = activeTab === 'cancellation';

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: t.TEXT, margin: 0 }}>Settings</h2>
            <p style={{ fontSize: 12, color: t.SUBTEXT, margin: '4px 0 0' }}>Manage your preferences</p>
          </div>

          {/* Save / reset only apply to the settings tabs */}
          {!isCancellation && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleReset}
                style={{ padding: '8px 16px', border: `1px solid ${t.BORDER}`, borderRadius: 10, background: t.CARD, color: t.SUBTEXT, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Reset defaults
              </button>
              <button onClick={handleSave}
                style={{ padding: '8px 20px', border: 'none', borderRadius: 10, background: t.ACCENT, color: t.ACCENT_TEXT, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                {saved && <i className="ti ti-check" style={{ fontSize: 13 }} />}
                {saved ? 'Saved' : 'Save changes'}
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: t.CARD2, borderRadius: 12, padding: 4 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', borderRadius: 9, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 400,
                background: activeTab === tab.id ? t.CARD : 'transparent',
                color: activeTab === tab.id ? t.TEXT : t.SUBTEXT,
                boxShadow: activeTab === tab.id ? (dark ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.08)') : 'none',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <i className={`ti ${tab.icon}`} style={{ fontSize: 14 }} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── APPEARANCE ── */}
        {activeTab === 'appearance' && (
          <>
            <Section title="Accent color" t={t}>
              <div style={{ padding: '12px 0 16px' }}>
                <div style={{ fontSize: 12, color: t.SUBTEXT, marginBottom: 12 }}>
                  The highlight color used across the panel. Dark mode lives in the top bar.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {ACCENT_COLORS.map(c => {
                    const active = settings.accentColor === c.value;
                    return (
                      <div key={c.value} onClick={() => setLive('accentColor', c.value)}
                        style={{ textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, background: c.value,
                          border: active ? `3px solid ${t.TEXT}` : `2px solid ${t.BORDER}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {active && <i className="ti ti-check" style={{ fontSize: 16, color: t.ACCENT_TEXT }} />}
                        </div>
                        <div style={{ fontSize: 9, color: t.MUTED, marginTop: 4 }}>{c.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Section>

            <Section title="Text size" t={t}>
              <div style={{ padding: '12px 0 16px' }}>
                <div style={{ fontSize: 12, color: t.SUBTEXT, marginBottom: 12 }}>Base font size of the panel</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['small', 'medium', 'large'].map(size => (
                    <button key={size} onClick={() => setLive('fontSize', size)}
                      style={{
                        flex: 1, padding: '10px',
                        border: settings.fontSize === size ? `2px solid ${t.ACCENT}` : `1px solid ${t.BORDER}`,
                        borderRadius: 10,
                        background: settings.fontSize === size ? t.CARD2 : t.CARD,
                        fontSize: size === 'small' ? 11 : size === 'medium' ? 13 : 15,
                        fontWeight: settings.fontSize === size ? 700 : 400,
                        cursor: 'pointer', fontFamily: 'inherit', color: t.TEXT,
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
          <Section title="Alerts" t={t}>
            <SettingRow t={t} icon="ti-bell" label="Bell notifications" desc="Show alerts for new bookings, payments and messages">
              <Toggle t={t} value={local.notifications} onChange={v => set('notifications', v)} />
            </SettingRow>
            <SettingRow t={t} icon="ti-volume" label="Sound alerts" desc="Play a chime when a new notification arrives" last>
              <Toggle t={t} value={local.soundAlerts} onChange={v => { set('soundAlerts', v); if (v) playSoundPreview(); }} />
            </SettingRow>
          </Section>
        )}

        {/* ── REGIONAL ── */}
        {activeTab === 'regional' && (
          <Section title="Currency and dates" t={t}>
            <SettingRow t={t} icon="ti-currency-peso" label="Currency" desc="Shown in billing, payments and reports">
              <select value={local.currency} onChange={e => set('currency', e.target.value)} style={selectStyle}>
                <option value="PHP">PHP — Philippine Peso (₱)</option>
                <option value="USD">USD — US Dollar ($)</option>
              </select>
            </SettingRow>
            <SettingRow t={t} icon="ti-calendar" label="Date format" desc="How dates appear across the system" last>
              <select value={local.dateFormat} onChange={e => set('dateFormat', e.target.value)} style={selectStyle}>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </SettingRow>
          </Section>
        )}

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <Section title="Visible cards" t={t}>
            <SettingRow t={t} icon="ti-cash" label="Total revenue" desc="Show the revenue card on the dashboard">
              <Toggle t={t} value={local.showRevenue} onChange={v => set('showRevenue', v)} />
            </SettingRow>
            <SettingRow t={t} icon="ti-bed" label="Occupancy rate" desc="Show the room occupancy card">
              <Toggle t={t} value={local.showOccupancy} onChange={v => set('showOccupancy', v)} />
            </SettingRow>
            <SettingRow t={t} icon="ti-clipboard-list" label="Recent reservations" desc="Show the latest bookings list">
              <Toggle t={t} value={local.showReservations} onChange={v => set('showReservations', v)} />
            </SettingRow>
            <SettingRow t={t} icon="ti-chart-bar" label="Revenue chart" desc="Show the 6-month revenue chart" last>
              <Toggle t={t} value={local.showChart} onChange={v => set('showChart', v)} />
            </SettingRow>
          </Section>
        )}

        {/* ── CANCELLATION (moved out of the sidebar) ── */}
        {isCancellation && (
          <div style={{
            background: t.CARD, borderRadius: 16, border: `1px solid ${t.BORDER}`,
            padding: 16, boxShadow: t.dark ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
          }}>
            <Cancellation embedded />
          </div>
        )}

        {saved && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: t.ACCENT, color: t.ACCENT_TEXT, borderRadius: 12,
            padding: '12px 28px', fontSize: 13, fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: 999,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-check" style={{ fontSize: 15 }} />
            Settings saved
          </div>
        )}
      </div>
    </PageLayout>
  );
}