import { auth } from '../../firebase/firebase';
import { ensureGuestAuth } from '../../lib/guestAuth';

// Guest chat helpers for the automatic answers (see /api/chat-quick-reply).

// Milliseconds of a chat message's time, so answers sort right after the
// question even within the same second.
export function messageTimeMs(message) {
  const t = message?.timestamp || message?.createdAt;
  if (!t) return Number.MAX_SAFE_INTEGER; // still sending: keep it last
  if (typeof t.toMillis === 'function') return t.toMillis();
  return (Number(t.seconds) || 0) * 1000 + Math.floor((Number(t.nanoseconds) || 0) / 1e6);
}
export const sortChatMessages = list => [...list].sort((a, b) => messageTimeMs(a) - messageTimeMs(b));

async function post(body) {
  const user = auth.currentUser || await ensureGuestAuth();
  const token = await user.getIdToken();
  const response = await fetch('/api/chat-quick-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The answer could not be sent.');
  return result;
}

// Tapped question button: posts the question and its answer.
export const sendQuickQuestion = (conversationId, replyId) => post({ conversationId, replyId });

// Typed message (already saved): the server answers it if it can. Never
// throws, so a failed auto answer doesn't look like a failed message.
export async function askForAutoAnswer(conversationId, text) {
  try {
    return await post({ conversationId, text: String(text).slice(0, 600) });
  } catch (error) {
    console.warn('Automatic chat answer failed:', error);
    return { answered: false };
  }
}

export async function loadQuickQuestions() {
  try {
    const response = await fetch('/api/chat-quick-reply');
    const result = response.ok ? await response.json() : { replies: [] };
    return Array.isArray(result.replies) ? result.replies : [];
  } catch {
    return [];
  }
}

// "Check availability": the bot answers with the rooms free on those dates.
export const checkChatAvailability = (conversationId, { checkIn, checkOut, guests }) =>
  post({ conversationId, availability: { checkIn, checkOut, guests } });
