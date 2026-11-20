// Reads the resort's data for the daily backup and turns it into a file
// that can be restored later (scripts/restore-backup.mjs).
//
// Firestore dates are saved as { "__timestamp": "<ISO date>" } so a restore
// puts them back as real dates instead of plain text.

export const BACKUP_FORMAT = 'lawiswis-backup/2';

// What goes into the backup, in the order shown in the PDF.
export const BACKUP_COLLECTIONS = [
  { name: 'reservations', label: 'Reservations', about: 'Every booking: guest, contact details, room, dates, status and amounts.' },
  { name: 'payments', label: 'Payments', about: 'Payments received online (PayMongo) and at the front desk.' },
  { name: 'refunds', label: 'Refunds', about: 'Refunds sent back to guests.' },
  { name: 'rooms', label: 'Rooms', about: 'Rooms and cottages, rates, capacity and photos.' },
  { name: 'users', label: 'Staff accounts', about: 'Staff names, emails and roles (passwords are not stored here).' },
  { name: 'promoCodes', label: 'Promo codes', about: 'Discount codes and their dates.' },
  { name: 'feedback', label: 'Guest feedback', about: 'Ratings and comments from guests.' },
  { name: 'contacts', label: 'Contact messages', about: 'Messages sent through the website contact form.' },
  { name: 'conversations', label: 'Chat conversations', about: 'Website chat threads with guests.' },
  { name: 'conversationMessages', label: 'Chat messages', about: 'Each message inside the chat threads.', group: 'messages' },
  { name: 'news', label: 'News articles', about: 'News and blog posts on the website.' },
  { name: 'faqs', label: 'FAQs', about: 'Questions and answers on the website.' },
  { name: 'newsletterSubscribers', label: 'Newsletter subscribers', about: 'Emails signed up for the newsletter.' },
  { name: 'tasks', label: 'Staff tasks', about: 'Dashboard to-do items.' },
  { name: 'modificationAudit', label: 'Booking change history', about: 'Who changed a booking and what changed.' },
  { name: 'refundAudit', label: 'Refund history', about: 'Who approved or processed each refund.' },
  { name: 'settings', label: 'Settings', about: 'Resort settings: rates, policies, closures and more.' },
];

// Not backed up: the email inbox copy (kept in Gmail itself), bell
// notifications, activity feeds, phone-screen links and ID photos (deleted
// after review on purpose).
export const NOT_BACKED_UP = 'Email inbox copy (kept in Gmail), notifications, activity feed, Senior/PWD ID photos (deleted after review on purpose).';

export function toBackupValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toDate === 'function') return { __timestamp: value.toDate().toISOString() };
  if (value instanceof Date) return { __timestamp: value.toISOString() };
  if (typeof value.path === 'string' && typeof value.collection === 'function') return { __ref: value.path };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length <= 2) {
    return { __geo: [value.latitude, value.longitude] };
  }
  if (Array.isArray(value)) return value.map(toBackupValue);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toBackupValue(item)]));
  return value;
}

// Reads every collection. A collection that fails is listed in `failed`
// instead of stopping the whole backup.
export async function readBackupData(db) {
  const data = {};
  const counts = {};
  const failed = [];
  for (const { name, group } of BACKUP_COLLECTIONS) {
    try {
      if (group) {
        const snapshot = await db.collectionGroup(group).get();
        // Only messages that belong to a chat conversation.
        const docs = snapshot.docs.filter(doc => doc.ref.parent?.parent?.parent?.id === 'conversations');
        data[name] = docs.map(doc => ({ id: doc.id, conversationId: doc.ref.parent.parent.id, ...toBackupValue(doc.data()) }));
      } else {
        const snapshot = await db.collection(name).get();
        data[name] = snapshot.docs.map(doc => ({ id: doc.id, ...toBackupValue(doc.data()) }));
      }
      counts[name] = data[name].length;
    } catch (error) {
      failed.push({ name, error: String(error?.message || error).slice(0, 200) });
      data[name] = [];
      counts[name] = 0;
    }
  }
  return { data, counts, failed };
}
