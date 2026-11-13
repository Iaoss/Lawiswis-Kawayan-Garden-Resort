import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertToast } from '../../components/ui/alert-toast.tsx';
import { dismissToast, pushToast, setToastsEnabled, subscribeToasts } from '../lib/staffToasts';

// Pop-up alerts in the bottom-right corner of the staff portal. The bell
// (NotificationBell: bookings, payments, guest messages, …) and the check-in
// reminder push alerts here.

export default function StaffToaster({ prefix = '/admin', enabled = true }) {
  const [toasts, setToasts] = useState([]);
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => { setToastsEnabled(enabled); }, [enabled]);
  useEffect(() => subscribeToasts(setToasts), []);
  // Payments and guest messages are bell notifications now; the bell pops
  // them up here when they arrive (no separate listeners needed).

  const close = toast => {
    dismissToast(toast.key);
    toast.onDismiss?.();
  };

  const runPrimary = async toast => {
    setBusyKey(toast.key);
    try {
      await toast.primary.run();
      close(toast);
    } catch (error) {
      pushToast({ variant: 'error', title: `${toast.primary.label} failed`, description: error.message || 'Please try again from the booking.' });
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div aria-live="polite"
      style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 450, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', width: 'min(384px, calc(100vw - 32px))', pointerEvents: 'none', fontFamily: "'Poppins', sans-serif" }}>
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <AlertToast
            key={toast.key}
            variant={toast.variant}
            styleVariant={toast.variant === 'warning' || toast.variant === 'error' ? 'filled' : 'default'}
            title={toast.title}
            description={toast.description}
            onClose={() => close(toast)}
            actionLabel={toast.path ? (toast.actionLabel || 'Open') : undefined}
            onAction={toast.path ? () => { close(toast); window.location.href = toast.path; } : undefined}
            primaryLabel={toast.primary?.label}
            onPrimary={toast.primary ? () => runPrimary(toast) : undefined}
            primaryBusy={busyKey === toast.key}
            style={{ pointerEvents: 'auto' }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
