import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { SettingsProvider } from './admin/components/SettingsContext';
import { ThemeProvider } from 'next-themes';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <SettingsProvider>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </SettingsProvider>
);