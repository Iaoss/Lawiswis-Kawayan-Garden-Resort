import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import RequireStaffRoute from './admin/components/RequireStaffRoute';
import Home from './client/pages/Home';
import ClientLayout from './client/components/ClientLayout';
import { AppDialogHost } from './components/ui/app-dialog';

// Pages load on demand, so guests never download the staff portal code.
const Login = lazy(() => import('./admin/pages/Login'));
const AdminDashboard = lazy(() => import('./admin/pages/Dashboard'));
const RoomManagement = lazy(() => import('./admin/pages/RoomManagement'));
const WalkIn = lazy(() => import('./admin/pages/WalkIn'));
const Reservations = lazy(() => import('./admin/pages/Reservations'));
const Billing = lazy(() => import('./admin/pages/Billing'));
const PaymentTransactions = lazy(() => import('./admin/pages/PaymentTransactions'));
const CustomerManagement = lazy(() => import('./admin/pages/CustomerManagement'));
const ReservationHistory = lazy(() => import('./admin/pages/ReservationHistory'));
const Reports = lazy(() => import('./admin/pages/Reports'));
const UserManagement = lazy(() => import('./admin/pages/UserManagement'));
const Feedback = lazy(() => import('./admin/pages/Feedback'));
const ContactInquiries = lazy(() => import('./admin/pages/ContactInquiries'));
const CancellationPolicy = lazy(() => import('./admin/pages/CancellationPolicy'));
const Messages = lazy(() => import('./admin/pages/Messages'));
const ReceptionistDashboard = lazy(() => import('./admin/pages/ReceptionistDashboard'));
const Rooms = lazy(() => import('./client/pages/Rooms'));
const BookRoom = lazy(() => import('./client/pages/BookRoom'));
const BookingHistory = lazy(() => import('./client/pages/BookingHistory'));
const GuestChat = lazy(() => import('./client/pages/Chat'));
const About = lazy(() => import('./client/pages/About'));
const Contact = lazy(() => import('./client/pages/Contact'));
const BookingTypeSelection = lazy(() => import('./client/pages/BookingTypeSelection'));
const CorporateBooking = lazy(() => import('./client/pages/CorporateBooking'));
const Amenities = lazy(() => import('./client/pages/Amenities'));
const Certifications = lazy(() => import('./client/pages/Certifications'));
const CustomerCarePage = lazy(() => import('./client/pages/CustomerCarePage'));
const FeedbackForm = lazy(() => import('./client/pages/FeedbackForm'));
const BookingTransactions = lazy(() => import('./admin/pages/BookingTransactions'));
const Settings = lazy(() => import('./admin/pages/Settings'));
const NewsManagement = lazy(() => import('./admin/pages/NewsManagement.js'));
const Email = lazy(() => import('./admin/pages/Email.js'));
const PromoCodes = lazy(() => import('./admin/pages/PromoCodes'));

// Opening another page (e.g. "Book room") starts at the top, not wherever
// the previous page was scrolled to.
function ScrollToTopOnPageChange() {
  const { pathname } = useLocation();
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [pathname]);
  return null;
}

function PageLoading() {
  return (
    <div role="status" aria-live="polite" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#6b7280', fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
      Loading…
    </div>
  );
}

function BookingPaymentResult() {
  const navigate = useNavigate();
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
        <button onClick={() => { navigate('/home'); }} style={{ background: '#1a3a1a', color: '#fff', border: 0, borderRadius: '8px', padding: '12px 18px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>Return to resort website</button>
      </section>
    </main>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTopOnPageChange />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/admin/login" element={<Login />} />

        <Route path="/admin" element={<RequireStaffRoute><Outlet /></RequireStaffRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<RequireStaffRoute allowedRoles={['admin']}><AdminDashboard /></RequireStaffRoute>} />
          <Route path="rooms" element={<RoomManagement />} />
          <Route path="promos" element={<RequireStaffRoute allowedRoles={['admin']}><PromoCodes /></RequireStaffRoute>} />
          <Route path="walkin" element={<WalkIn />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="billing" element={<Billing />} />
          <Route path="payments" element={<PaymentTransactions />} />
          <Route path="customers" element={<CustomerManagement />} />
          <Route path="history" element={<ReservationHistory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="contact-inquiries" element={<ContactInquiries />} />
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
          <Route path="/booking-options" element={<BookingTypeSelection />} />
          <Route path="/corporate-booking" element={<CorporateBooking />} />
          <Route path="/book/:roomId" element={<BookRoom />} />
          <Route path="/my-bookings" element={<BookingHistory />} />
          <Route path="/amenities" element={<Amenities />} />
          <Route path="/about-us" element={<About />} />
          <Route path="/certifications" element={<Certifications />} />
          <Route path="/contact-us" element={<Contact />} />
          <Route path="/faqs" element={<CustomerCarePage pageKey="faqs" />} />
          <Route path="/safety-guidelines" element={<CustomerCarePage pageKey="safety-guidelines" />} />
          <Route path="/health-and-wellness" element={<CustomerCarePage pageKey="health-and-wellness" />} />
          <Route path="/cancellation-policy" element={<CustomerCarePage pageKey="cancellation-policy" />} />
          <Route path="/privacy-policy" element={<CustomerCarePage pageKey="privacy-policy" />} />
          <Route path="/about" element={<Navigate to="/about-us" replace />} />
          <Route path="/contact" element={<Navigate to="/contact-us" replace />} />
        </Route>
        <Route path="/feedback" element={<FeedbackForm />} />
        <Route path="/chat" element={<GuestChat />} />
        <Route path="/payment/success" element={<BookingPaymentResult />} />
        <Route path="/payment/cancelled" element={<BookingPaymentResult />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </Suspense>
      <AppDialogHost />
    </Router>
  );
}

export default App;