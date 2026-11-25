jest.mock('../../../lib/firebaseAdmin', () => {
  const state = { rooms: {}, reports: {} };
  const fieldValue = {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    arrayUnion: (...values) => ({ transform: 'arrayUnion', values }),
    arrayRemove: (...values) => ({ transform: 'arrayRemove', values }),
  };
  const storeName = name => (name === 'maintenanceReports' ? 'reports' : name);
  const apply = (collectionName, id, updates) => {
    const records = state[storeName(collectionName)];
    const current = records[id] || {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value?.transform === 'arrayUnion') {
        current[key] = [...new Set([...(current[key] || []), ...value.values])];
      } else if (value?.transform === 'arrayRemove') {
        current[key] = (current[key] || []).filter(item => !value.values.includes(item));
      } else {
        current[key] = value;
      }
    });
    records[id] = current;
  };
  const snapshot = (collectionName, id) => {
    const data = state[storeName(collectionName)][id];
    return { exists: Boolean(data), data: () => data };
  };
  const ref = (collectionName, id) => ({
    collectionName,
    id,
    get: async () => snapshot(collectionName, id),
    update: async updates => apply(collectionName, id, updates),
  });
  const adminDb = {
    collection: collectionName => ({
      doc: id => ref(collectionName, id || 'generated-report'),
    }),
    runTransaction: callback => callback({
      get: documentRef => snapshot(documentRef.collectionName, documentRef.id),
      create: (documentRef, data) => { state[storeName(documentRef.collectionName)][documentRef.id] = data; },
      update: (documentRef, updates) => apply(documentRef.collectionName, documentRef.id, updates),
    }),
  };
  return { adminDb, FieldValue: fieldValue, __state: state };
});

jest.mock('../../../lib/verifyStaff', () => ({ verifyStaff: jest.fn() }));
jest.mock('../../../lib/offlineRequests', () => ({ runOnce: (_staff, _id, run) => run() }));
jest.mock('../../../lib/activityLog', () => ({ logActivity: jest.fn() }));

import housekeepingHandler from '../../../apiHandlers/housekeeping';
import reportsHandler from '../../../apiHandlers/housekeeping-reports';

const state = jest.requireMock('../../../lib/firebaseAdmin').__state;
const verifyStaff = jest.requireMock('../../../lib/verifyStaff').verifyStaff;

const makeResponse = () => {
  const response = {
    statusCode: 0,
    body: null,
    setHeader: jest.fn(),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return response;
};

const makeRequest = (body, method = 'POST') => ({
  method,
  headers: { authorization: 'Bearer test-token' },
  body,
});

beforeEach(() => {
  state.rooms = { 'room-1': { roomNumber: 'Ground 1', status: 'available' } };
  state.reports = {};
  verifyStaff.mockReset();
  verifyStaff.mockResolvedValue({ uid: 'staff-1', name: 'Housekeeper One', email: 'staff@test.invalid', role: 'housekeeper' });
});

test('a maintenance report is attributed and blocks the room in one transaction', async () => {
  const response = makeResponse();
  await housekeepingHandler(makeRequest({
    action: 'report-issue',
    roomId: 'room-1',
    issueType: 'air-conditioning',
    note: 'AC is leaking',
    offlineRequestId: 'offline-1',
  }), response);

  expect(response.statusCode).toBe(200);
  expect(state.rooms['room-1']).toMatchObject({
    status: 'maintenance',
    maintenanceNote: 'AC is leaking',
    openMaintenanceReportIds: ['staff-1_offline-1'],
  });
  expect(state.reports['staff-1_offline-1']).toMatchObject({
    roomId: 'room-1',
    issueType: 'air-conditioning',
    note: 'AC is leaking',
    reportedByUid: 'staff-1',
    reportedByName: 'Housekeeper One',
    status: 'open',
  });
});

test('housekeepers cannot directly clear maintenance or change other room statuses', async () => {
  const response = makeResponse();
  await housekeepingHandler(makeRequest({
    action: 'set-room-status',
    roomId: 'room-1',
    status: 'maintenance',
    maintenanceNote: 'AC is leaking',
  }), response);

  expect(response.statusCode).toBe(403);
  expect(state.rooms['room-1'].status).toBe('available');
});

test('a room with open reports cannot be released by a direct status update', async () => {
  verifyStaff.mockResolvedValue({ uid: 'admin-1', name: 'Manager', role: 'admin' });
  state.rooms['room-1'] = { status: 'maintenance', openMaintenanceReportIds: ['report-1'] };
  const response = makeResponse();
  await housekeepingHandler(makeRequest({
    action: 'set-room-status',
    roomId: 'room-1',
    status: 'available',
  }), response);

  expect(response.statusCode).toBe(409);
  expect(state.rooms['room-1'].status).toBe('maintenance');
});

test('resolving one report keeps a room blocked while another report remains open', async () => {
  verifyStaff.mockResolvedValue({ uid: 'admin-1', name: 'Manager', role: 'admin' });
  state.rooms['room-1'] = {
    roomNumber: 'Ground 1',
    status: 'maintenance',
    maintenanceNote: 'AC is leaking',
    openMaintenanceReportIds: ['report-1', 'report-2'],
  };
  state.reports['report-1'] = { roomId: 'room-1', note: 'AC is leaking', status: 'open' };
  state.reports['report-2'] = { roomId: 'room-1', note: 'Tap is broken', status: 'open' };
  const response = makeResponse();
  await reportsHandler(makeRequest({ action: 'resolve-report', reportId: 'report-1' }), response);

  expect(response.statusCode).toBe(200);
  expect(state.reports['report-1'].status).toBe('resolved');
  expect(state.rooms['room-1']).toMatchObject({
    status: 'maintenance',
    maintenanceNote: 'Tap is broken',
    openMaintenanceReportIds: ['report-2'],
  });
});

test('resolving the last open report releases the room', async () => {
  verifyStaff.mockResolvedValue({ uid: 'admin-1', name: 'Manager', role: 'admin' });
  state.rooms['room-1'] = { status: 'maintenance', openMaintenanceReportIds: ['report-1'] };
  state.reports['report-1'] = { roomId: 'room-1', note: 'AC is leaking', status: 'open' };
  const response = makeResponse();
  await reportsHandler(makeRequest({ action: 'resolve-report', reportId: 'report-1' }), response);

  expect(response.statusCode).toBe(200);
  expect(state.reports['report-1'].status).toBe('resolved');
  expect(state.rooms['room-1']).toMatchObject({ status: 'available', openMaintenanceReportIds: [] });
});
