import React, { useEffect, useRef, useState } from 'react';
import './app-dialog.css';

// Styled replacements for the browser's alert / confirm / prompt boxes.
//
//   await appAlert('Saved.')
//   if (await appConfirm('Delete this?', { tone: 'danger', confirmLabel: 'Delete' })) ...
//   const reason = await appPrompt('Why?', { required: true })   // null if cancelled
//
// <AppDialogHost /> is mounted once in App.js. The dialog follows the staff
// portal's dark mode and accent colour, and the guest site's green theme.

let pushDialog = null;
const queue = [];

function open(options) {
  return new Promise(resolve => {
    const request = { ...options, resolve };
    if (pushDialog) pushDialog(request);
    else queue.push(request);
  });
}

export const appAlert = (message, options = {}) => open({ kind: 'alert', message, ...options });
export const appConfirm = (message, options = {}) => open({ kind: 'confirm', message, ...options });
export const appPrompt = (message, options = {}) => open({ kind: 'prompt', message, ...options });

const ICONS = { info: 'i', success: '✓', warning: '!', danger: '!' };
const DEFAULT_TITLES = { alert: 'Notice', confirm: 'Please confirm', prompt: 'Add a note' };

export function AppDialogHost() {
  const [dialogs, setDialogs] = useState([]);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const primaryRef = useRef(null);
  const current = dialogs[0];

  useEffect(() => {
    pushDialog = request => setDialogs(list => [...list, request]);
    if (queue.length) setDialogs(list => [...list, ...queue.splice(0)]);
    return () => { pushDialog = null; };
  }, []);

  useEffect(() => {
    if (!current) return undefined;
    setValue(current.defaultValue || '');
    const previous = document.activeElement;
    const timer = setTimeout(() => (inputRef.current || primaryRef.current)?.focus(), 30);
    return () => {
      clearTimeout(timer);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [current]);

  if (!current) return null;

  const close = result => {
    current.resolve(result);
    setDialogs(list => list.slice(1));
  };
  const cancelResult = current.kind === 'prompt' ? null : current.kind === 'confirm' ? false : undefined;
  const confirmResult = current.kind === 'prompt' ? value.trim() : current.kind === 'confirm' ? true : undefined;
  const blocked = current.kind === 'prompt' && current.required && !value.trim();
  const tone = current.tone || (current.kind === 'confirm' ? 'warning' : 'info');
  const guestSite = !/^\/(admin|receptionist)/.test(window.location.pathname);

  return (
    <div className={`app-dialog-backdrop${guestSite ? ' app-dialog--guest' : ''}`}
      onMouseDown={event => { if (event.target === event.currentTarget && current.kind !== 'alert') close(cancelResult); }}>
      <form
        role={current.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className={`app-dialog app-dialog--${tone}`}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(current.kind === 'alert' ? undefined : cancelResult); } }}
        onSubmit={event => { event.preventDefault(); if (!blocked) close(confirmResult); }}
      >
        <div className="app-dialog__head">
          <span className="app-dialog__icon" aria-hidden="true">{ICONS[tone] || 'i'}</span>
          <h2 id="app-dialog-title" className="app-dialog__title">{current.title || DEFAULT_TITLES[current.kind]}</h2>
        </div>
        <p id="app-dialog-message" className="app-dialog__message">{current.message}</p>
        {current.kind === 'prompt' && (
          <label className="app-dialog__field">
            <span>{current.inputLabel || (current.required ? 'Reason (required)' : 'Note (optional)')}</span>
            {current.multiline === false ? (
              <input ref={inputRef} value={value} onChange={event => setValue(event.target.value)} maxLength={current.maxLength || 500} placeholder={current.placeholder || ''} />
            ) : (
              <textarea ref={inputRef} rows={3} value={value} onChange={event => setValue(event.target.value)} maxLength={current.maxLength || 500} placeholder={current.placeholder || ''}
                onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !blocked) close(confirmResult); }} />
            )}
          </label>
        )}
        <div className="app-dialog__actions">
          {current.kind !== 'alert' && (
            <button type="button" className="app-dialog__button app-dialog__button--secondary" onClick={() => close(cancelResult)}>
              {current.cancelLabel || 'Cancel'}
            </button>
          )}
          <button ref={primaryRef} type="submit" disabled={blocked}
            className={`app-dialog__button ${tone === 'danger' ? 'app-dialog__button--danger' : 'app-dialog__button--primary'}`}>
            {current.confirmLabel || (current.kind === 'alert' ? 'OK' : current.kind === 'prompt' ? 'Save' : 'Confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}
