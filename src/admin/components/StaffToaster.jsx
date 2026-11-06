import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Timestamp, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { AlertToast } from '../../components/ui/alert-toast.tsx';
import { dismissToast, pushToast, setToastsEnabled, subscribeToasts } from '../lib/staffToasts';
import { money } from '../lib/money';

// Pop-up alerts in the bottom-right corner of the staff portal. The bell
// (NotificationBell) and the check-in reminder push alerts here; this
// component also watches for payments received and new guest chat messages.

const peso = value => money(value);
const ref = id => `#${String(id || '').slice(0, 8).toUpperCase()}`;
const METHODS = { cash: 'cash', gcash: 'GCash', paymaya: 'Maya', maya: 'Maya', grab_pay: 'GrabPay', card: 'card', qrph: 'QR Ph', bank: 'bank transfer' };

// Payments recorded after this page opened (counter and PayMongo).
function usePaymentAlerts(prefix, active) {
  useEffect(() => {
    if (!active) return undefined;
    const since = Timestamp.fromMillis(Date.now() - 5000);
    return onSnapshot(query(collection(db, 'payments'), where('createdAt', '>=', since)), snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const p = change.doc.data();
        // Wait for the server time to be filled in.
        if (!p.createdAt) return;
        const online = p.provider === 'paymongo';
        pushToast({
          id: `payment_${change.doc.id}`,
          variant: 'success',
          title: online ? 'Online payment received' : 'Payment recorded',
          description: `${peso(p.amount)} ${METHODS[String(p.method || '').toLowerCase()] || p.method || ''} from ${p.guestName || 'a guest'} · booking ${ref(p.reservationId)}`.replace(/\s+/g, ' '),
          path: `${prefix}/reservations?booking=${encodeURIComponent(p.reservationId || '')}`,
          actionLabel: 'Open booking',
        });
      });
    }, () => {});
  }, [prefix, active]);
}

// Guest chats that get a new unread message while staff are signed in.
function useChatAlerts(prefix, active) {
  const seeded = useRef(false);
  useEffect(() => {
    if (!active) return undefined;
    seeded.current = false;
    return onSnapshot(query(collection(db, 'conversations'), where('unread', '==', true)), snapshot => {
      if (!seeded.current) { seeded.current = true; return; }
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') return;
        const c = change.doc.data();
        const at = c.lastMessageAt?.toMillis ? c.lastMessageAt.toMillis() : 0;
        // Already looking at the chats: no pop-up needed.
        if (!at || window.location.pathname.endsWith('/messages')) return;
        pushToast({
          id: `chat_${change.doc.id}_${at}`,
          variant: 'info',
          title: `New message from ${c.guestName || 'a guest'}`,
          description: String(c.lastMessage || '').slice(0, 120) || 'Open Messages to reply.',
          path: `${prefix}/messages`,
          actionLabel: 'Reply',
        });
      });
    }, () => {});
  }, [prefix, active]);
}

export default function StaffToaster({ prefix = '/admin', enabled = true }) {
  const [toasts, setToasts] = useState([]);
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => { setToastsEnabled(enabled); }, [enabled]);
  useEffect(() => subscribeToasts(setToasts), []);
  usePaymentAlerts(prefix, enabled);
  useChatAlerts(prefix, enabled);

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
