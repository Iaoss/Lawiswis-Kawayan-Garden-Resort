// Fallback quick replies shown until the staff add their own in Settings → Quick Replies.
export const DEFAULT_QUICK_REPLIES = [
  { id: 'default-checkin', question: 'Check-in Time', answer: 'Standard check-in is at 2:00 PM and check-out is at 12:00 NN.' },
  { id: 'default-daytour', question: 'Day Tour Hours', answer: 'Our day tour runs from 8:00 AM to 5:00 PM.' },
  { id: 'default-directions', question: 'Directions', answer: 'We are at 402 Brgy. Buguion, Calumpit, Bulacan. From Manila, take NLEX → Pulilan Exit → follow the signs to Calumpit.' },
  { id: 'default-contact', question: 'Contact Us', answer: 'You can reach us at 0917 811 2332 or lawiswiskawayyyan123@gmail.com.' },
];

export function sortQuickReplies(items) {
  return [...items].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    || String(a.question || '').localeCompare(String(b.question || '')));
}
