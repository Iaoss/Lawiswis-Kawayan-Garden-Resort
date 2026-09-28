import React from 'react';
import { Outlet } from 'react-router-dom';
import ChatWidget from './ChatWidget';
import ClientChrome from './ClientChrome';

export default function ClientLayout() {
  return (
    <ClientChrome>
      <Outlet />
      <ChatWidget />
    </ClientChrome>
  );
}