import { auth } from '../../firebase/firebase';

export async function notifyStaffOfGuestMessage(conversationId, messageId) {
  const user = auth.currentUser;
  if (!user || !conversationId || !messageId) return;
  try {
    const response = await fetch('/api/staff-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({ action: 'notify-chat', conversationId, messageId }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Guest message notification failed.');
    }
  } catch (error) {
    console.warn('Staff could not be notified about a guest message:', error);
  }
}
