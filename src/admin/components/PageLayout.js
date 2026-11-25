import React from 'react';
import Layout from './Layout';
import ReceptionistLayout from './ReceptionistLayout';
import HousekeeperLayout from './HousekeeperLayout';

export default function PageLayout({ children }) {
  const path = window.location.pathname;
  const Wrapper = path.startsWith('/housekeeper')
    ? HousekeeperLayout
    : path.startsWith('/receptionist') ? ReceptionistLayout : Layout;
  return <Wrapper>{children}</Wrapper>;
}