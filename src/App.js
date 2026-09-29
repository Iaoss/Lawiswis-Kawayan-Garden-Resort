import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Login from './admin/pages/Login';
import RequireStaffRoute from './admin/components/RequireStaffRoute';
import AdminDashboard from './admin/pages/Dashboard';
import RoomManagement from './admin/pages/RoomManagement';
import WalkIn from './admin/pages/WalkIn';
import Reservations from './admin/pages/Reservations';
import Billing from './admin/pages/Billing';
import PaymentTransactions from './admin/pages/PaymentTransactions';
import CustomerManagement from './admin/pages/CustomerManagement';
import ReservationHistory from './admin/pages/ReservationHistory';
import Reports from './admin/pages/Reports';
import UserManagement from './admin/pages/UserManagement';
import Feedback from './admin/pages/Feedback';
import CancellationPolicy from './admin/pages/CancellationPolicy';
import Messages from './admin/pages/Messages';
import ReceptionistDashboard from './admin/pages/ReceptionistDashboard';
import Home from './client/pages/Home';
import Rooms from './client/pages/Rooms';
import BookRoom from './client/pages/BookRoom';
import GuestChat from './client/pages/Chat';
import About from './client/pages/About';
import Contact from './client/pages/Contact';
import FeedbackForm from './client/pages/FeedbackForm';
import ClientLayout from './client/components/ClientLayout';
import BookingTransactions from './admin/pages/BookingTransactions';
import Settings from './admin/pages/Settings';
import NewsManagement from './admin/pages/NewsManagement.js';
import Email from './admin/pages/Email.js';

function BookingPaymentResult() {
  const cancelled = window.location.pathname === '/payment/cancelled';
  const reservationId = new URLSearchParams(window.location.search).get('reservationId') || '';
  const bookingRef = reservationId ? reservationId.slice(0, 8).toUpperCase() : '';

  return (
    <main style={{ minHeight: '100vh', background: '#f7f8f5', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: "'Poppins', sans-serif", color: '#1f2937' }}>
      <section style={{ width: '100%', maxWidth: '500px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '36px', textAlign: 'center' }}>
        <div style={{ width: '54px', height: '54px', margin: '0 auto 18px', borderRadius: '50%', background: cancelled ? '#fff7ed' : '#eaf4ec', color: cancelled ? '#b45309' : '#2f6b3f', display: 'grid', placeItems: 'center' }} aria-hidden="true">
          {cancelled ? '!' : <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
        </div>
        <h1 style={{ fontSize: '22px', margin: '0 0 10px', color: '#1a3a1a' }}>{cancelled ? 'Payment not completed' : 'Thank you for your booking'}</h1>
        <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#6b7280', margin: '0 0 18px' }}>
          {cancelled ? 'Your payment was not completed. Your reservation request may remain pending while the resort reviews it.' : 'Your payment step is complete. The resort is processing your reservation details.'}
        </p>
        {bookingRef && <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#374151' }}>Booking reference <strong>#{bookingRef}</strong></p>}
        {!cancelled && <p role="status" style={{ background: '#f0f7f0', color: '#355a42', borderRadius: '8px', padding: '14px', fontSize: '12px', lineHeight: 1.7, margin: '0 0 22px' }}>Your official booking receipt and confirmation details will be sent to the email address provided.</p>}
        <button onClick={() => { window.location.href = '/home'; }} style={{ background: '#1a3a1a', color: '#fff', border: 0, borderRadius: '8px', padding: '12px 18px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>Return to resort website</button>
      </section>
    </main>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin/login" element={<Login />} />

        <Route path="/admin" element={<RequireStaffRoute><Outlet /></RequireStaffRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<RequireStaffRoute allowedRoles={['admin']}><AdminDashboard /></RequireStaffRoute>} />
          <Route path="rooms" element={<RoomManagement />} />
          <Route path="walkin" element={<WalkIn />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="billing" element={<Billing />} />
          <Route path="payments" element={<PaymentTransactions />} />
          <Route path="customers" element={<CustomerManagement />} />
          <Route path="history" element={<ReservationHistory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="cancellation" element={<CancellationPolicy />} />
          <Route path="messages" element={<Messages />} />
          <Route path="settings" element={<Settings />} />
          <Route path="email" element={<Email />} />
          <Route path="news" element={<RequireStaffRoute allowedRoles={['admin']}><NewsManagement /></RequireStaffRoute>} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Route>

        <Route path="/receptionist" element={<RequireStaffRoute allowedRoles={['receptionist']}><Outlet /></RequireStaffRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ReceptionistDashboard />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="walkin" element={<WalkIn />} />
          <Route path="rooms" element={<RoomManagement />} />
          <Route path="billing" element={<Billing />} />
          <Route path="customers" element={<CustomerManagement />} />
          <Route path="history" element={<ReservationHistory />} />
          <Route path="messages" element={<Messages />} />
          <Route path="transactions" element={<BookingTransactions />} />
          <Route path="cancellation" element={<CancellationPolicy />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/receptionist/dashboard" replace />} />
        </Route>

        {/* Client Website */}
        <Route element={<ClientLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/book/:roomId" element={<BookRoom />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
        </Route>
        <Route path="/feedback" element={<FeedbackForm />} />
        <Route path="/chat" element={<GuestChat />} />
        <Route path="/payment/success" element={<BookingPaymentResult />} />
        <Route path="/payment/cancelled" element={<BookingPaymentResult />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;