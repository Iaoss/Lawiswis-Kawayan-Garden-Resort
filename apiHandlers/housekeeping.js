import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { logActivity } from '../lib/activityLog';
import { runOnce } from '../lib/offlineRequests';
import { verifyStaff } from '../lib/verifyStaff';

const MAX_NOTE_LENGTH = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Room status service is unavailable.' });

  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Please sign in with an active staff account.' });

  const body = req.body || {};
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  const status = body.status === 'out-of-order' ? 'maintenance' : body.status;
  const maintenanceNote = typeof body.maintenanceNote === 'string' ? body.maintenanceNote.trim() : '';
  if (body.action !== 'set-room-status'
    || !roomId || roomId.length > 128
    || !['available', 'cleaning', 'maintenance'].includes(status)
    || maintenanceNote.length > MAX_NOTE_LENGTH
    || (status === 'maintenance' && !maintenanceNote)) {
    return res.status(400).json({ error: 'Provide a room, a valid status, and a maintenance note when reporting an issue.' });
  }

  try {
    const result = await runOnce(staff, body.offlineRequestId, async () => {
      const roomRef = adminDb.collection('rooms').doc(roomId);
      const roomSnapshot = await roomRef.get();
      if (!roomSnapshot.exists) {
        const error = new Error('This room no longer exists.');
        error.status = 404;
        throw error;
      }
      const room = roomSnapshot.data() || {};
      if (room.status === 'occupied') {
        const error = new Error('An occupied room cannot be updated from housekeeping.');
        error.status = 409;
        throw error;
      }

      await roomRef.update({
        status,
        maintenanceNote: status === 'maintenance' ? maintenanceNote : '',
        statusUpdatedAt: FieldValue.serverTimestamp(),
        statusUpdatedBy: staff.uid,
      });
      await logActivity(staff, {
        action: 'room_status_changed',
        summary: `Changed Room ${String(room.roomNumber || roomId).slice(0, 40)} to ${status === 'maintenance' ? 'Out of Order' : status}`,
        details: { roomId, status, maintenanceNote: status === 'maintenance' ? maintenanceNote : '' },
      });
      return { roomId, status, maintenanceNote: status === 'maintenance' ? maintenanceNote : '' };
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Could not update housekeeping room status:', error);
    return res.status(500).json({ error: 'Could not update this room. Please try again.' });
  }
}
