import React from 'react';
import { Outlet } from 'react-router-dom';
import ChatWidget from './ChatWidget';
import ClientChrome from './ClientChrome';
import ResortAvailabilityNotice from './ResortAvailabilityNotice';
import { ResortAvailabilityProvider } from './ResortAvailabilityContext';

export default function ClientLayout() {
  return (
    <ResortAvailabilityProvider>
      <ClientChrome>
        <ResortAvailabilityNotice />
        <Outlet />
        <ChatWidget />
      </ClientChrome>
    </ResortAvailabilityProvider>
  );
}