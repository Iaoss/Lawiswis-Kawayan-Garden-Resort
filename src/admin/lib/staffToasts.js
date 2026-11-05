// Pop-up alerts for the staff portal (shown by StaffToaster). Kept outside
// React so an alert stays on screen when staff move to another page, and the
// same event never pops up twice in one session.
//
//   pushToast({ id, variant, title, description, path, actionLabel, sticky })
//     variant: 'info' | 'success' | 'warning' | 'error'
//     path:    page to open when "Open" is pressed (optional)
//     sticky:  stays until dismissed (otherwise hides after AUTO_HIDE_MS)
//     primary: { label, run } extra main button; run() may return a promise,
//              and the alert closes when it succeeds

export const AUTO_HIDE_MS = 9000;
const MAX_VISIBLE = 5;

let toasts = [];
let enabled = true;
const shownIds = new Set();
const listeners = new Set();
const timers = new Map();

const emit = () => listeners.forEach(listener => listener(toasts));

export function subscribeToasts(listener) {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

// Settings → Notifications off: no pop-ups (the bell still lists everything).
export function setToastsEnabled(value) {
  enabled = Boolean(value);
  if (!enabled && toasts.length) {
    toasts = [];
    emit();
  }
}

export function dismissToast(key) {
  clearTimeout(timers.get(key));
  timers.delete(key);
  const next = toasts.filter(toast => toast.key !== key);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

export function pushToast({ id, variant = 'info', title, description = '', path = '', actionLabel = '', sticky = false, onDismiss, primary = null }) {
  if (!enabled || !title) return null;
  if (id) {
    if (shownIds.has(id)) return null;
    shownIds.add(id);
  }
  const key = id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  toasts = [...toasts, { key, variant, title, description, path, actionLabel, sticky, onDismiss, primary }];
  // Oldest non-sticky alerts make room for new ones.
  while (toasts.length > MAX_VISIBLE) {
    const oldest = toasts.find(toast => !toast.sticky) || toasts[0];
    toasts = toasts.filter(toast => toast !== oldest);
  }
  emit();
  if (!sticky) timers.set(key, setTimeout(() => dismissToast(key), AUTO_HIDE_MS));
  return key;
}

// Colour for a bell notification, from its id.
export function variantForNotification(id = '') {
  if (id.startsWith('checkout-late') || id.startsWith('hold-conflict') || id.startsWith('negative-feedback')) return 'error';
  if (/^(checkout-due|cancellation-requested|refund-requested|date-change)/.test(id)) return 'warning';
  if (id.startsWith('new-booking') || id.startsWith('guest-reply')) return 'info';
  return 'info';
}
