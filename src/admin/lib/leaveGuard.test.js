import React from 'react';
import { render } from '@testing-library/react';
import { appConfirm } from '../../components/ui/app-dialog';
import { guardedNavigate, useLeaveGuard } from './leaveGuard';

jest.mock('../../components/ui/app-dialog', () => ({ appConfirm: jest.fn() }));

function Page({ dirty }) {
  useLeaveGuard(dirty, { title: 'Discard this walk-in?' });
  return null;
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => appConfirm.mockReset());

test('navigates straight away when nothing is unsaved', () => {
  const navigate = jest.fn();
  render(<Page dirty={false} />);
  guardedNavigate(navigate)('/admin/billing');
  expect(appConfirm).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith('/admin/billing', undefined);
});

test('asks first, and stays when staff choose "Keep editing"', async () => {
  appConfirm.mockResolvedValue(false);
  const navigate = jest.fn();
  const { unmount } = render(<Page dirty />);
  guardedNavigate(navigate)('/admin/billing');
  await flush();
  expect(appConfirm).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ title: 'Discard this walk-in?' }));
  expect(navigate).not.toHaveBeenCalled();
  unmount();
});

test('leaves when staff choose "Discard booking"', async () => {
  appConfirm.mockResolvedValue(true);
  const navigate = jest.fn();
  const { unmount } = render(<Page dirty />);
  guardedNavigate(navigate)('/admin/billing');
  await flush();
  expect(navigate).toHaveBeenCalledWith('/admin/billing', undefined);
  unmount();
});

test('stops asking once the page has nothing unsaved', () => {
  const navigate = jest.fn();
  const { rerender } = render(<Page dirty />);
  rerender(<Page dirty={false} />);
  guardedNavigate(navigate)('/admin/billing');
  expect(appConfirm).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalled();
});
