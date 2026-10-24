import { auth } from '../../firebase/firebase';

// Calls a staff-only API route with the signed-in user's token.
// Throws with the server's message when the request is refused.
export async function staffApi(path, body, method = 'POST') {
  const user = auth.currentUser;
  if (!user) throw new Error('Your session has ended. Please sign in again.');
  const token = await user.getIdToken();
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The change could not be saved. Please try again.');
  return result;
}

// Short note about the payment receipt email, for success messages.
export function receiptNotice({ receipt, receiptError } = {}) {
  if (receiptError) return ` Receipt email failed: ${receiptError}`;
  if (receipt?.sent) return ` Receipt ${receipt.receiptNumber || ''} emailed.`.replace('  ', ' ');
  if (receipt?.alreadySent) return ' Receipt email was already sent.';
  return receipt ? ' Receipt email is being sent.' : '';
}
