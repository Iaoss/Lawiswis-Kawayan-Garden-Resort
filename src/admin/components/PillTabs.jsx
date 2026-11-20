import React from 'react';
import './pill-tabs.css';

// Portal tabs in the page's own colours.
//   variant="folder" (default): folder tabs. The chosen tab is the same colour
//     as the panel under it and joins it with curved corners. Put the
//     section's content in <FolderPanel> right after the tabs.
//   variant="pill": a small rounded switch (Day / Week / Month and filters).
//
// items: [{ id, label, icon?: 'ti-…', count?: number, hint?: string }]
// t:     { CARD, CARD2, BORDER, TEXT, MUTED, ACCENT, ACCENT_TEXT }

export const tabColors = (t = {}) => ({
  '--tab-surface': t.CARD || '#ffffff',
  '--tab-idle': t.CARD2 || '#f3f4f6',
  '--tab-border': t.BORDER || '#e5e7eb',
  '--tab-text': t.TEXT || '#111827',
  '--tab-muted': t.MUTED || '#6b7280',
  '--tab-accent': t.ACCENT || '#9cb56f',
  '--tab-accent-text': t.ACCENT_TEXT || '#0a1a0a',
});

export function FolderPanel({ t, children, style, className = '', ...rest }) {
  return (
    <div className={`folder-panel ${className}`.trim()} style={{ ...tabColors(t), ...style }} {...rest}>
      {children}
    </div>
  );
}

export default function PillTabs({ items, value, onChange, label, t, variant = 'folder', size = 'md', stretch = false, className = '' }) {
  const move = (event, index) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const last = items.length - 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
      : event.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : (index === 0 ? last : index - 1);
    onChange(items[next].id);
    event.currentTarget.parentElement?.children[next]?.focus();
  };
  const base = variant === 'pill' ? 'pill-tabs' : 'folder-tabs';
  return (
    <div role="tablist" aria-label={label} style={tabColors(t)}
      className={`${base} ${base}--${size}${stretch ? ` ${base}--stretch` : ''} ${className}`.trim()}>
      {items.map((item, index) => {
        const on = item.id === value;
        return (
          <button key={item.id === '' ? '__all' : item.id} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} title={item.hint}
            className={variant === 'pill' ? 'pill-tab' : 'folder-tab'} onClick={() => onChange(item.id)} onKeyDown={event => move(event, index)}>
            {item.icon && <i className={`ti ${item.icon}`} aria-hidden="true" />}
            <span>{item.label}</span>
            {item.count > 0 && <span className="tab-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
