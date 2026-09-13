import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './admin/pages/Login';
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

function App() {
  return (
    <Router>
      <Routes>
        {/* Auth */}
        <Route path="/" element={<Login />} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/rooms" element={<RoomManagement />} />
        <Route path="/admin/walkin" element={<WalkIn />} />
        <Route path="/admin/reservations" element={<Reservations />} />
        <Route path="/admin/billing" element={<Billing />} />
        <Route path="/admin/payments" element={<PaymentTransactions />} />
        <Route path="/admin/customers" element={<CustomerManagement />} />
        <Route path="/admin/history" element={<ReservationHistory />} />
        <Route path="/admin/reports" element={<Reports />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/feedback" element={<Feedback />} />
        <Route path="/admin/cancellation" element={<CancellationPolicy />} />
        <Route path="/admin/messages" element={<Messages />} />
        <Route path="/admin/settings" element={<Settings />} />

        {/* Receptionist */}
        <Route path="/receptionist/dashboard" element={<ReceptionistDashboard />} />
        <Route path="/receptionist/reservations" element={<Reservations />} />
        <Route path="/receptionist/walkin" element={<WalkIn />} />
        <Route path="/receptionist/rooms" element={<RoomManagement />} />
        <Route path="/receptionist/billing" element={<Billing />} />
        <Route path="/receptionist/customers" element={<CustomerManagement />} />
        <Route path="/receptionist/history" element={<ReservationHistory />} />
        <Route path="/receptionist/messages" element={<Messages />} />
        <Route path="/receptionist/transactions" element={<BookingTransactions />} />
        <Route path="/receptionist/cancellation" element={<CancellationPolicy />} />
        <Route path="/receptionist/settings" element={<Settings />} />

        {/* Client Website */}
        <Route element={<ClientLayout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/book/:roomId" element={<BookRoom />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/feedback" element={<FeedbackForm />} />
        </Route>
        <Route path="/chat" element={<GuestChat />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;