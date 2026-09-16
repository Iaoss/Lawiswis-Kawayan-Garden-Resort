import React, { useState } from 'react';
import PageLayout from '../components/PageLayout';
import { useSettings, DEFAULT_SETTINGS } from '../context/SettingsContext';

const ACCENT_COLORS = [
  { label: 'Lime',    value: '#9cb56f' },
  { label: 'Teal',   value: '#5eead4' },
  { label: 'Blue',   value: '#60a5fa' },
  { label: 'Purple', value: '#c084fc' },
  { label: 'Orange', value: '#fb923c' },
  { label: 'Pink',   value: '#f472b6' },
];

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 999, cursor: 'pointer',
      background: value ? '#1a3a1a' : '#e5e7eb',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: value ? 'var(--accent, #9cb56f)' : '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

function SettingRow({ icon, label, desc, children, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: last ? 'none' : '1px solid #f3f4f6',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f4f6f4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s-text, #111)' }}>{label}</div>
          {desc && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{desc}</div>}
        </div>
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--s-card, #fff)', borderRadius: 16, border: '1px solid var(--s-border, #e5e7eb)', padding: '4px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 0 8px' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const selectStyle = {
  border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '7px 12px', fontSize: 12,
  fontFamily: "'Poppins', sans-serif", outline: 'none',
  background: '#fff', color: '#111', cursor: 'pointer',
};

const TABS = [
  { id: 'appearance',    label: 'Appearance',    icon: '🎨' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'regional',      label: 'Regional',      icon: '🌏' },
  { id: 'security',      label: 'Security',      icon: '🔒' },
  { id: 'dashboard',     label: 'Dashboard',     icon: '📊' },
];

export default function Settings() {
  const { settings, updateSetting, saveAll, resetAll } = useSettings();
  const [local, setLocal] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');

  const set = (key, value) => setLocal(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    saveAll(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings to default?')) {
      setLocal({ ...DEFAULT_SETTINGS });
      resetAll();
    }
  };

  // Apply dark mode preview immediately on toggle
  const handleDarkMode = (v) => {
    set('darkMode', v);
    document.documentElement[v ? 'setAttribute' : 'removeAttribute']('data-theme', 'dark');
  };

  // Apply accent color preview immediately
  const handleAccent = (v) => {
    set('accentColor', v);
    document.documentElement.style.setProperty('--accent', v);
  };

  // Apply font size preview immediately
  const handleFontSize = (v) => {
    set('fontSize', v);
    const map = { small: '13px', medium: '15px', large: '17px' };
    document.documentElement.style.setProperty('--base-font', map[v]);
  };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", maxWidth: 860, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>Settings</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>Manage your admin preferences</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReset}
              style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Reset Defaults
            </button>
            <button onClick={handleSave}
              style={{ padding: '8px 20px', border: 'none', borderRadius: 10, background: '#1a3a1a', color: 'var(--accent, #9cb56f)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}>
              {saved ? '✓ Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f4f6f4', borderRadius: 12, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', borderRadius: 9, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11, fontWeight: activeTab === t.id ? 700 : 400,
                background: activeTab === t.id ? '#fff' : 'transparent',
                color: activeTab === t.id ? '#1a3a1a' : '#6b7280',
                boxShadow: activeTab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── APPEARANCE ── */}
        {activeTab === 'appearance' && (<>
          <Section title="Theme">
            <SettingRow icon="🌙" label="Dark Mode" desc="Switch the admin panel to a dark theme">
              <Toggle value={local.darkMode} onChange={handleDarkMode} />
            </SettingRow>
            <SettingRow icon="📐" label="Compact Sidebar" desc="Reduce sidebar to icons only — reload to apply" last>
              <Toggle value={local.compactSidebar} onChange={v => set('compactSidebar', v)} />
            </SettingRow>
          </Section>

          <Section title="Accent Color">
            <div style={{ padding: '12px 0 16px' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Choose the highlight color used across the admin panel</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {ACCENT_COLORS.map(c => (
                  <div key={c.value} onClick={() => handleAccent(c.value)} style={{ textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, background: c.value,
                      border: local.accentColor === c.value ? '3px solid #1a3a1a' : '2px solid #e5e7eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', boxShadow: local.accentColor === c.value ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                    }}>
                      {local.accentColor === c.value && <span style={{ fontSize: 18, color: '#1a3a1a' }}>✓</span>}
                    </div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Text Size">
            <div style={{ padding: '12px 0 16px' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Adjust the base font size of the admin panel</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { id: 'small',  label: 'Small',  size: 11 },
                  { id: 'medium', label: 'Medium', size: 13 },
                  { id: 'large',  label: 'Large',  size: 15 },
                ].map(s => (
                  <button key={s.id} onClick={() => handleFontSize(s.id)}
                    style={{
                      flex: 1, padding: '12px',
                      border: local.fontSize === s.id ? '2px solid #1a3a1a' : '1px solid #e5e7eb',
                      borderRadius: 10,
                      background: local.fontSize === s.id ? '#f0fdf0' : '#fff',
                      fontSize: s.size, fontWeight: local.fontSize === s.id ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'inherit', color: '#111',
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </Section>
        </>)}

        {/* ── NOTIFICATIONS ── */}
        {activeTab === 'notifications' && (
          <Section title="Alert Preferences">
            <SettingRow icon="🔔" label="Push Notifications" desc="Show in-app bell alerts for bookings and messages">
              <Toggle value={local.notifications} onChange={v => set('notifications', v)} />
            </SettingRow>
            <SettingRow icon="🔊" label="Sound Alerts" desc="Play a chime when a new notification arrives">
              <Toggle value={local.soundAlerts} onChange={v => {
                set('soundAlerts', v);
                if (v) {
                  // Play a preview beep
                  try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.frequency.value = 880;
                    g.gain.setValueAtTime(0.3, ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                    o.start(ctx.currentTime);
                    o.stop(ctx.currentTime + 0.4);
                  } catch {}
                }
              }} />
            </SettingRow>
            <SettingRow icon="📧" label="Email Alerts" desc="Receive email notifications for new online bookings">
              <Toggle value={local.emailAlerts} onChange={v => set('emailAlerts', v)} />
            </SettingRow>
            <SettingRow icon="📋" label="New Reservation Alerts" desc="Get notified when a guest submits an online booking">
              <Toggle value={local.notifications} onChange={v => set('notifications', v)} />
            </SettingRow>
            <SettingRow icon="💬" label="New Message Alerts" desc="Get notified when a guest sends a message" last>
              <Toggle value={local.notifications} onChange={v => set('notifications', v)} />
            </SettingRow>
          </Section>
        )}

        {/* ── REGIONAL ── */}
        {activeTab === 'regional' && (
          <Section title="Locale & Format">
            <SettingRow icon="🌏" label="Language" desc="Display language for the admin interface">
              <select value={local.language} onChange={e => set('language', e.target.value)} style={selectStyle}>
                <option value="en">English</option>
                <option value="fil">Filipino</option>
              </select>
            </SettingRow>
            <SettingRow icon="🕐" label="Timezone" desc="Used for reservation times and reports">
              <select value={local.timezone} onChange={e => set('timezone', e.target.value)} style={selectStyle}>
                <option value="Asia/Manila">Asia/Manila (PHT +8)</option>
                <option value="UTC">UTC</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT +8)</option>
              </select>
            </SettingRow>
            <SettingRow icon="💱" label="Currency" desc="Currency symbol shown in billing and reports">
              <select value={local.currency} onChange={e => set('currency', e.target.value)} style={selectStyle}>
                <option value="PHP">₱ Philippine Peso</option>
                <option value="USD">$ US Dollar</option>
              </select>
            </SettingRow>
            <SettingRow icon="📅" label="Date Format" desc="How dates appear across the system" last>
              <select value={local.dateFormat} onChange={e => set('dateFormat', e.target.value)} style={selectStyle}>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </SettingRow>
          </Section>
        )}

        {/* ── SECURITY ── */}
        {activeTab === 'security' && (<>
          <Section title="Session Management">
            <SettingRow icon="⏱" label="Auto Logout" desc="Automatically sign out after inactivity">
              <select value={local.autoLogout} onChange={e => set('autoLogout', e.target.value)} style={selectStyle}>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="never">Never</option>
              </select>
            </SettingRow>
            <SettingRow icon="⚠️" label="Session Timeout Warning" desc="Show a 1-minute warning before auto logout">
              <Toggle value={local.sessionTimeout} onChange={v => set('sessionTimeout', v)} />
            </SettingRow>
            <SettingRow icon="🔐" label="Two-Factor Authentication" desc="Require a verification code when signing in" last>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {local.twoFactor && <span style={{ fontSize: 10, background: '#dcfce7', color: '#16a34a', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>Active</span>}
                <Toggle value={local.twoFactor} onChange={v => set('twoFactor', v)} />
              </div>
            </SettingRow>
          </Section>

          <Section title="Data">
            <div style={{ padding: '14px 0' }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#991b1b', marginBottom: 4 }}>Clear Local Cache</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>Clears saved settings and cached data from this browser. Does not affect Firebase data.</div>
                <button onClick={() => {
                  if (window.confirm('Clear all local cache? Your settings will reset.')) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                  style={{ padding: '7px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Clear Cache & Reload
                </button>
              </div>
            </div>
          </Section>
        </>)}

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <Section title="Visible Widgets">
            <SettingRow icon="💰" label="Show Total Revenue" desc="Display the revenue stat card on the dashboard">
              <Toggle value={local.showRevenue} onChange={v => set('showRevenue', v)} />
            </SettingRow>
            <SettingRow icon="🛏" label="Show Occupancy Rate" desc="Display the room occupancy stat card">
              <Toggle value={local.showOccupancy} onChange={v => set('showOccupancy', v)} />
            </SettingRow>
            <SettingRow icon="📋" label="Show Recent Reservations" desc="Display the latest bookings list on the dashboard">
              <Toggle value={local.showReservations} onChange={v => set('showReservations', v)} />
            </SettingRow>
            <SettingRow icon="📊" label="Show Revenue Chart" desc="Display the 6-month revenue bar chart" last>
              <Toggle value={local.showChart} onChange={v => set('showChart', v)} />
            </SettingRow>
          </Section>
        )}

        {/* Floating save toast */}
        {saved && (
          <div style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            background: '#1a3a1a', color: 'var(--accent, #9cb56f)',
            borderRadius: 14, padding: '13px 28px', fontSize: 13, fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'fadeIn 0.2s ease',
          }}>
            ✓ Settings saved successfully
          </div>
        )}
      </div>
    </PageLayout>
  );
}