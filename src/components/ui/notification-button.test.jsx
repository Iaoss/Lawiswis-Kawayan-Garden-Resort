import React from 'react';
import { render, screen } from '@testing-library/react';
import NotificationButton from './notification-button';

describe('NotificationButton', () => {
  test('shows capped unread count and retains caller colors', () => {
    render(
      <NotificationButton
        aria-label="Alerts"
        count={12}
        style={{ background: '#282827', border: '1px solid #383837' }}
      />
    );

    expect(screen.getByRole('button', { name: 'Alerts' })).toHaveStyle({
      background: '#282827',
      border: '1px solid #383837',
    });
    expect(screen.getByText('9+')).toHaveStyle({
      background: '#ef4444',
      color: '#fff',
    });
  });

  test('does not show a badge for zero notifications', () => {
    render(<NotificationButton aria-label="Alerts" count={0} />);

    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
    expect(screen.queryByLabelText('0 notifications')).not.toBeInTheDocument();
  });
});
