import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { logActivity } from '../lib/activityLog';
import { runOnce } from '../lib/offlineRequests';
import { verifyStaff } from '../lib/verifyStaff';
import { sendStaffPush } from '../lib/staffPush';

const MAX_NOTE_LENGTH = 500;
const HOUSEKEEPING_ROLES = ['admin', 'receptionist', 'housekeeper'];
const ISSUE_TYPES = ['air-conditioning', 'plumbing', 'electrical', 'other'];
const cleanRequestId = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function reportIssue(staff, body) {
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  const issueType = typeof body.issueType === 'string' ? body.issueType.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!roomId || roomId.length > 128 || !ISSUE_TYPES.includes(issueType) || note.length < 3 || note.length > MAX_NOTE_LENGTH) {
    throw requestError('Provide a room, issue type, and a note between 3 and 500 characters.', 400);
  }

  const requestId = cleanRequestId(body.offlineRequestId);
  const reportId = requestId
    ? `${staff.uid}_${requestId}`
    : adminDb.collection('maintenanceReports').doc().id;
  const reportRef = adminDb.collection('maintenanceReports').doc(reportId);
  const roomRef = adminDb.collection('rooms').doc(roomId);
  const result = await adminDb.runTransaction(async transaction => {
    const reportSnapshot = await transaction.get(reportRef);
    if (reportSnapshot.exists) return { roomId, reportId, status: 'open', alreadySaved: true };

    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) throw requestError('This room no longer exists.', 404);
    const room = roomSnapshot.data() || {};
    if (String(room.status || '').trim().toLowerCase() === 'occupied') {
      throw requestError('An occupied room cannot be reported from housekeeping.', 409);
    }

    transaction.create(reportRef, {
      roomId,
      roomNumber: String(room.roomNumber || roomId).slice(0, 80),
      issueType,
      note,
      reportedByUid: staff.uid,
      reportedByName: staff.name || staff.email || 'Staff member',
      reportedByRole: staff.role,
      reportedAt: FieldValue.serverTimestamp(),
      status: 'open',
    });
    transaction.update(roomRef, {
      status: 'maintenance',
      maintenanceNote: note,
      maintenanceReportId: reportId,
      openMaintenanceReportIds: FieldValue.arrayUnion(reportId),
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: staff.uid,
    });
    return { roomId, roomNumber: String(room.roomNumber || roomId).slice(0, 80), reportId, status: 'open' };
  });
  if (!result.alreadySaved) {
    await sendStaffPush({
      roles: ['admin', 'receptionist'],
      title: `Maintenance · Room ${result.roomNumber || roomId}`,
      body: `${issueType.replace('-', ' ')}: ${note}`,
      url: '/admin/housekeeping',
    });
    await logActivity(staff, {
      action: 'maintenance_report_created',
      summary: `Reported a ${issueType.replace('-', ' ')} issue in Room ${roomId.slice(0, 40)}`,
      details: { roomId, reportId, issueType, note },
    });
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Room status service is unavailable.' });

  const staff = await verifyStaff(req, { allowedRoles: HOUSEKEEPING_ROLES });
  if (!staff) return res.status(401).json({ error: 'Please sign in with an active staff account.' });

  const body = req.body || {};
  if (body.action === 'report-issue') {
    try {
      const result = await reportIssue(staff, body);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(result);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('Could not save a maintenance report:', error);
      return res.status(500).json({ error: 'Could not save this maintenance report. Please try again.' });
    }
  }

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
    const roomRef = adminDb.collection('rooms').doc(roomId);
    const result = await runOnce(staff, body.offlineRequestId, async () => {
      return adminDb.runTransaction(async transaction => {
        const roomSnapshot = await transaction.get(roomRef);
        if (!roomSnapshot.exists) throw requestError('This room no longer exists.', 404);
        const room = roomSnapshot.data() || {};
        const currentStatus = String(room.status || '').trim().toLowerCase();
        if (currentStatus === 'occupied') {
          throw requestError('An occupied room cannot be updated from housekeeping.', 409);
        }
        const openReportIds = Array.isArray(room.openMaintenanceReportIds) ? room.openMaintenanceReportIds : [];
        if (openReportIds.length && status !== 'maintenance') {
          throw requestError('Resolve the open maintenance reports before changing this room status.', 409);
        }
        if (staff.role === 'housekeeper') {
          if (status === 'available' && currentStatus === 'available') {
            return { roomId, roomNumber: room.roomNumber || roomId, status, maintenanceNote: '', alreadySaved: true };
          }
          if (status !== 'available' || currentStatus !== 'cleaning') {
            throw requestError('Housekeepers can only mark a cleaning room as available. Report maintenance issues instead.', 403);
          }
        } else if (status === 'cleaning' && !['available', 'cleaning'].includes(currentStatus)) {
          throw requestError('Only an available room can be sent for cleaning.', 409);
        }

        transaction.update(roomRef, {
          status,
          maintenanceNote: status === 'maintenance' ? maintenanceNote : '',
          statusUpdatedAt: FieldValue.serverTimestamp(),
          statusUpdatedBy: staff.uid,
        });
        return { roomId, roomNumber: room.roomNumber || roomId, status, maintenanceNote: status === 'maintenance' ? maintenanceNote : '' };
      });
    });
    if (!result.alreadySaved) {
      if (staff.role !== 'housekeeper' && status === 'cleaning') {
        await sendStaffPush({
          roles: ['housekeeper'],
          title: `Room ${result.roomNumber} needs cleaning`,
          body: 'Please clean and inspect this room, then mark it Available.',
          url: '/housekeeper/housekeeping',
        });
      }
      await logActivity(staff, {
        action: 'room_status_changed',
        summary: `Changed Room ${String(result.roomNumber || roomId).slice(0, 40)} to ${status === 'maintenance' ? 'Out of Order' : status}`,
        details: { roomId, status, maintenanceNote: status === 'maintenance' ? maintenanceNote : '' },
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Could not update housekeeping room status:', error);
    return res.status(500).json({ error: 'Could not update this room. Please try again.' });
  }
}
