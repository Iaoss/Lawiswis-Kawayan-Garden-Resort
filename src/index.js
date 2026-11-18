import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './responsive.css';
import './motion.css';
import App from './App';
import { SettingsProvider } from './admin/components/SettingsContext';
import { register as registerOfflineSupport } from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <SettingsProvider>
    <App />
  </SettingsProvider>
);

// Keep the site's files on this computer so the staff portal opens offline.
registerOfflineSupport();
