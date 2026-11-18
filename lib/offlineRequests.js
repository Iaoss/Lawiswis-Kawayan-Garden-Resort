// Changes made offline in the staff portal are sent later with an id
// (offlineRequestId). If the connection drops while one is being sent, the
// portal sends it again; this makes sure it is only saved once by
// remembering each id's result.
import { adminDb, FieldValue } from './firebaseAdmin';

const cleanId = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

export async function runOnce(staff, offlineRequestId, run) {
  const id = cleanId(offlineRequestId);
  if (!id || !adminDb) return run();
  const ref = adminDb.collection('offlineRequests').doc(`${staff.uid}_${id}`);
  const saved = await ref.get();
  if (saved.exists) return { ...(saved.data().result || {}), alreadySaved: true };
  const result = await run();
  try {
    await ref.set({
      uid: staff.uid,
      result: JSON.parse(JSON.stringify(result ?? {})),
      savedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Could not remember the offline request:', error);
  }
  return result;
}
