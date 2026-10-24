import React, { Suspense } from 'react';
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
        {/* Keeps the header and footer on screen while a page's code loads. */}
        <Suspense fallback={<div role="status" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#6b7280', fontSize: '13px' }}>Loading…</div>}>
          <Outlet />
        </Suspense>
        <ChatWidget />
      </ClientChrome>
    </ResortAvailabilityProvider>
  );
}