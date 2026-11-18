import { auth } from '../../firebase/firebase';
import { invalidateCollections } from './cachedCollection';
import { enqueue, isQueueable, OFFLINE_PREFIX } from './offlineOutbox';

const OFFLINE_MESSAGE = 'No internet connection. This needs the internet; please try again when it is back.';
const isNetworkError = error => error instanceof TypeError || /network|failed to fetch|load failed/i.test(String(error?.message || ''));

// Sends one request now. Throws an Error with .status set when the server
// refuses it.
export async function sendStaffRequest(path, body, method = 'POST') {
  const user = auth.currentUser;
  if (!user) throw new Error('Your session has ended. Please sign in again.');
  const token = await user.getIdToken();
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The change could not be saved. Please try again.');
    error.status = response.status;
    throw error;
  }
  // Something may have changed: pages reload their saved lists. (Plain
  // lookups and previews change nothing.)
  if (!(body?.preview || /-get$/.test(String(body?.action || '')))) invalidateCollections();
  return result;
}

// What a page gets back when an action was saved for later.
function queued(path, body, method) {
  const item = enqueue(path, body, method, auth.currentUser?.uid || '');
  return {
    offline: true,
    queuedId: item.id,
    // A walk-in made offline gets a placeholder booking number until it syncs.
    ...(body?.action === 'create-walk-in' ? { reservationId: `${OFFLINE_PREFIX}${item.id}` } : {}),
  };
}

// Calls a staff-only API route with the signed-in user's token.
// Throws with the server's message when the request is refused.
// Without internet, payments, charges, check-ins / check-outs and walk-ins
// are saved on this computer and sent later (see offlineOutbox.js); the
// result then has { offline: true }.
export async function staffApi(path, body, method = 'POST') {
  const canQueue = isQueueable(path, body);
  // Anything that refers to an offline walk-in must wait for it too.
  const refersToOffline = typeof body?.reservationId === 'string' && body.reservationId.startsWith(OFFLINE_PREFIX);
  if (refersToOffline) {
    if (canQueue) return queued(path, body, method);
    throw new Error('This booking was made offline and is not saved on the server yet. Try again once the internet is back.');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (canQueue) return queued(path, body, method);
    throw new Error(OFFLINE_MESSAGE);
  }
  try {
    return await sendStaffRequest(path, body, method);
  } catch (error) {
    if (!error.status && isNetworkError(error)) {
      if (canQueue) return queued(path, body, method);
      throw new Error(OFFLINE_MESSAGE);
    }
    throw error;
  }
}

// Short note about the payment receipt email, for success messages.
export function receiptNotice({ receipt, receiptError } = {}) {
  if (receiptError) return ` Receipt email failed: ${receiptError}`;
  if (receipt?.sent) return ` Receipt ${receipt.receiptNumber || ''} emailed.`.replace('  ', ' ');
  if (receipt?.alreadySent) return ' Receipt email was already sent.';
  return receipt ? ' Receipt email is being sent.' : '';
}
