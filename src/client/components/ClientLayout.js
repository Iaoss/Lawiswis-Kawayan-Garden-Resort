import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ChatWidget from './ChatWidget';
import ClientChrome from './ClientChrome';

export default function ClientLayout() {
  const { pathname } = useLocation();
  const hasOwnChrome = pathname === '/' || pathname.replace(/\/$/, '') === '/home';

  if (hasOwnChrome) {
    return (
      <>
        <Outlet />
        <ChatWidget />
      </>
    );
  }

  return (
    <ClientChrome>
      <Outlet />
      <ChatWidget />
    </ClientChrome>
  );
}