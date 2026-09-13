import React from 'react';
import Layout from './Layout';
import ReceptionistLayout from './ReceptionistLayout';

export default function PageLayout({ children }) {
  const isReceptionist = window.location.pathname.startsWith('/receptionist');
  const Wrapper = isReceptionist ? ReceptionistLayout : Layout;
  return <Wrapper>{children}</Wrapper>;
}