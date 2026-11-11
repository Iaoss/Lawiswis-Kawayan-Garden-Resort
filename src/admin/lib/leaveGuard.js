import { useEffect } from 'react';
import { appConfirm } from '../../components/ui/app-dialog';

// "You have unsaved work" warning for the staff portal.
//
// A page turns it on with useLeaveGuard(hasUnsavedWork, { ... }). While it is
// on, the sidebar (and search) ask before switching pages, and closing or
// reloading the tab shows the browser's own "Leave site?" box.

let guard = null;

export function useLeaveGuard(active, { title, message, leaveLabel, stayLabel } = {}) {
  useEffect(() => {
    if (!active) return undefined;
    const current = { title, message, leaveLabel, stayLabel };
    guard = current;
    const onBeforeUnload = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      if (guard === current) guard = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [active, title, message, leaveLabel, stayLabel]);
}

// Resolves true when it's fine to leave the page (no unsaved work, or staff
// chose to discard it).
export async function confirmLeave() {
  if (!guard) return true;
  const ok = await appConfirm(guard.message || 'You have unsaved changes on this page. Leave without saving?', {
    title: guard.title || 'Leave this page?',
    tone: 'warning',
    confirmLabel: guard.leaveLabel || 'Discard and leave',
    cancelLabel: guard.stayLabel || 'Stay',
  });
  if (ok) guard = null;
  return ok;
}

// Wraps react-router's navigate so it asks first when a page has unsaved work.
export function guardedNavigate(navigate) {
  return (to, options) => {
    if (!guard) { navigate(to, options); return; }
    confirmLeave().then(ok => { if (ok) navigate(to, options); });
  };
}
