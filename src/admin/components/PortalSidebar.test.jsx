import React from 'react';
import { render, screen } from '@testing-library/react';
import PortalSidebar from './PortalSidebar';
import { AnimatedSidebarProvider } from '../../components/ui/animated-sidebar.tsx';

jest.mock('react-router-dom', () => ({ useNavigate: () => () => {} }), { virtual: true });
jest.mock('firebase/firestore', () => ({ collection: () => ({}), collectionGroup: () => ({}), getDocs: () => Promise.resolve({ docs: [] }) }), { virtual: true });
jest.mock('../../firebase/firebase', () => ({ db: {}, auth: {} }));
jest.mock('../../components/ui/beam-avatar.tsx', () => ({ StaffAvatar: () => null }));
jest.mock('./AvatarPickerDialog', () => ({ __esModule: true, default: () => null, openAvatarPicker: () => {} }));
jest.mock('../lib/useStaffAccess', () => ({ useStaffAccess: () => ({ can: () => true }) }));

beforeAll(() => {
  // The test browser has no screen-size detection; the sidebar asks for it.
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
});

const receptionistNav = [
  { label: 'Dashboard', path: '/receptionist/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Reservations', path: '/receptionist/reservations', icon: 'ti-calendar-event' },
  { label: 'Walk-in', path: '/receptionist/walkin', icon: 'ti-walk' },
  { label: 'Billing', path: '/receptionist/billing', icon: 'ti-receipt' },
  { label: 'Messages', path: '/receptionist/messages', icon: 'ti-message-circle-2' },
  { label: 'Settings', path: '/receptionist/settings', icon: 'ti-settings' },
];

const renderSidebar = flat => render(
  <AnimatedSidebarProvider open onOpenChange={() => {}} navigate={() => {}}>
    <PortalSidebar navItems={receptionistNav} currentPath="/receptionist/billing" portalName="Receptionist" name="Ana" role="receptionist" initials="A" onLogout={() => {}} flat={flat} />
  </AnimatedSidebarProvider>,
);

test('receptionists get a simple list: no grouped dropdowns', () => {
  renderSidebar(true);
  ['Dashboard', 'Reservations', 'Walk-in', 'Billing', 'Messages', 'Settings'].forEach(label => {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });
  expect(screen.queryByText(/Front Desk/)).toBeNull();
  expect(screen.queryByText(/Financials/)).toBeNull();
  expect(screen.queryAllByRole('button', { expanded: false })).toHaveLength(0);
});

test('the admin menu keeps its groups', () => {
  renderSidebar(false);
  expect(screen.getAllByText(/Front Desk/).length).toBeGreaterThan(0);
});
