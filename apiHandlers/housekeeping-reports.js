import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { logActivity } from '../lib/activityLog';
import { verifyStaff } from '../lib/verifyStaff';

const REPORT_ROLES = ['admin', 'receptionist', 'housekeeper'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Maintenance report service is unavailable.' });

  const staff = await verifyStaff(req, { allowedRoles: REPORT_ROLES });
  if (!staff) return res.status(401).json({ error: 'Please sign in with an active staff account.' });
  if (staff.role === 'housekeeper') return res.status(403).json({ error: 'Only administrators and receptionists can resolve maintenance reports.' });

  const body = req.body || {};
  const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';
  if (body.action !== 'resolve-report' || !reportId || reportId.length > 160) {
    return res.status(400).json({ error: 'Provide a valid maintenance report to resolve.' });
  }

  try {
    const result = await adminDb.runTransaction(async transaction => {
      const reportRef = adminDb.collection('maintenanceReports').doc(reportId);
      const reportSnapshot = await transaction.get(reportRef);
      if (!reportSnapshot.exists) {
        const error = new Error('This maintenance report no longer exists.');
        error.status = 404;
        throw error;
      }
      const report = reportSnapshot.data() || {};
      if (report.status === 'resolved') return { reportId, status: 'resolved', alreadyResolved: true };

      const roomRef = adminDb.collection('rooms').doc(String(report.roomId || ''));
      const roomSnapshot = report.roomId ? await transaction.get(roomRef) : null;
      const room = roomSnapshot?.exists ? roomSnapshot.data() || {} : {};
      const existingIds = Array.isArray(room.openMaintenanceReportIds) ? room.openMaintenanceReportIds : [reportId];
      const remainingIds = existingIds.filter(id => id !== reportId);
      const nextReportSnapshot = remainingIds.length
        ? await transaction.get(adminDb.collection('maintenanceReports').doc(remainingIds[0]))
        : null;

      transaction.update(reportRef, {
        status: 'resolved',
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedByUid: staff.uid,
        resolvedByName: staff.name || staff.email || 'Staff member',
      });

      let roomStatus = room.status || '';
      if (roomSnapshot?.exists) {
        if (remainingIds.length) {
          const nextReport = nextReportSnapshot?.exists ? nextReportSnapshot.data() || {} : {};
          roomStatus = 'maintenance';
          transaction.update(roomRef, {
            status: 'maintenance',
            maintenanceNote: String(nextReport.note || room.maintenanceNote || ''),
            maintenanceReportId: remainingIds[0],
            openMaintenanceReportIds: FieldValue.arrayRemove(reportId),
            statusUpdatedAt: FieldValue.serverTimestamp(),
            statusUpdatedBy: staff.uid,
          });
        } else {
          roomStatus = room.status === 'maintenance' ? 'available' : room.status;
          transaction.update(roomRef, {
            ...(room.status === 'maintenance' ? { status: 'available', maintenanceNote: '', maintenanceReportId: '' } : {}),
            openMaintenanceReportIds: FieldValue.arrayRemove(reportId),
            statusUpdatedAt: FieldValue.serverTimestamp(),
            statusUpdatedBy: staff.uid,
          });
        }
      }
      return { reportId, roomId: report.roomId || '', status: 'resolved', roomStatus };
    });

    if (!result.alreadyResolved) {
      await logActivity(staff, {
        action: 'maintenance_report_resolved',
        summary: `Resolved the maintenance report for Room ${String(result.roomId || '').slice(0, 40)}`,
        details: { reportId, roomId: result.roomId, roomStatus: result.roomStatus },
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Could not resolve a maintenance report:', error);
    return res.status(500).json({ error: 'Could not resolve this maintenance report. Please try again.' });
  }
}
