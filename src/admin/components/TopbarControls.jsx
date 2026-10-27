import React, { useEffect, useRef, useState } from 'react';
import './topbar.css';
import { BeamAvatar } from '../../components/ui/beam-avatar.tsx';
import { openAvatarPicker } from './AvatarPickerDialog';
import { useStaffAccess } from '../lib/useStaffAccess';

export const topbarButtonStyle = dark => ({
  border: `1px solid ${dark ? '#383837' : '#e5e7eb'}`,
  background: dark ? '#282827' : '#f3f4f6',
  color: dark ? '#e8e8d8' : '#111827',
});

export function TopbarIconButton({ icon, label, dark, badge = 0, onClick }) {
  return (
    <button type="button" className="topbar-icon-btn" onClick={onClick} aria-label={label} title={label}
      style={topbarButtonStyle(dark)}>
      <i className={`ti ${icon}`} style={{ fontSize: '17px' }} />
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px',
          borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  );
}

export function PulsingDot({ color }) {
  return (
    <span className="topbar-dot" aria-hidden="true" style={{ '--topbar-dot-color': color }}>
      <span className="topbar-dot__ghost" />
      <span className="topbar-dot__core" />
    </span>
  );
}

export function AccountMenu({ initials, name, role, dark, accent, accentText, onSignOut }) {
  const [open, setOpen] = useState(false);
  const { user } = useStaffAccess();
  const avatar = user?.avatar || '';
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = event => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const text = dark ? '#e8e8d8' : '#111827';
  const muted = dark ? '#5a5a4a' : '#9ca3af';

  return (
    <div className="topbar-account" ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        style={{
          width: '36px', height: '36px', borderRadius: '50%', background: avatar ? 'transparent' : accent, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          fontWeight: 700, fontSize: '13px', color: accentText, padding: 0, overflow: 'hidden',
        }}>{avatar ? <BeamAvatar seed={avatar} size={36} /> : initials}</button>
      <div>
        <div style={{ fontWeight: 600, fontSize: '13px', color: text }}>{name}</div>
        <div style={{ fontSize: '11px', color: muted, textTransform: 'capitalize' }}>{role}</div>
      </div>
      {open && (
        <div role="menu" className="topbar-account__menu" style={{
          background: dark ? '#1c1c1c' : '#ffffff',
          border: `1px solid ${dark ? '#383837' : '#e5e7eb'}`,
          boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)',
        }}>
          <button type="button" role="menuitem" className="topbar-account__item" style={{ color: dark ? '#e8e8d8' : '#111827' }}
            onClick={() => { setOpen(false); openAvatarPicker(); }}>
            <i className="ti ti-mood-smile" /> {avatar ? 'Edit Avatar' : 'Choose Avatar'}
          </button>
          <button type="button" role="menuitem" className="topbar-account__item" style={{ color: '#ef4444' }}
            onClick={() => { setOpen(false); onSignOut(); }}>
            <i className="ti ti-logout" /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
