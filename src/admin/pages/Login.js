import React, { useState } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { ImageSlider } from '../../components/ui/image-slider.tsx';
import { RESORT_IMAGES } from '../../client/components/clientTheme';
import { IMAGE_WIDTHS, optimizeImage } from '../../lib/imageUrl';

const RESORT_SLIDES = [
  RESORT_IMAGES.hero,
  RESORT_IMAGES.garden,
  RESORT_IMAGES.pool,
  RESORT_IMAGES.dining,
];
const RESORT_LOGO = optimizeImage('https://lawiswiskawayanresort.com/wp-content/uploads/2026/02/logo-white-new-01.png', IMAGE_WIDTHS.logo);

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const role = String(userData.role || '').trim().toLowerCase();
        const status = String(userData.status || 'active').trim().toLowerCase();
        if (status === 'inactive' || !['admin', 'receptionist'].includes(role)) {
          await signOut(auth);
          setError(status === 'inactive'
            ? 'This account has been deactivated. Please contact the resort admin.'
            : 'This account does not have staff access.');
        } else {
          const requestedPath = location.state?.from?.pathname || '';
          const permittedPrefix = role === 'admin' ? '/admin/' : '/receptionist/';
          const destination = requestedPath.startsWith(permittedPrefix)
            ? requestedPath
            : role === 'admin' ? '/admin/dashboard' : '/receptionist/dashboard';
          navigate(destination, { replace: true });
        }

      } else {
        await signOut(auth);
        setError('User not found in system.');
      }
    } catch (err) {
      console.error('Login error:', err); // ← now you can see real errors
      setError('Invalid email or password.');
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    setError('');
    setResetSent(false);
    if (!email.trim()) {
      setError('Enter your email address first, then choose “Forgot password?”.');
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (resetError) {
      console.error('Password reset request failed:', resetError);
      setError(
        resetError.code === 'auth/user-not-found'
          ? 'No staff account was found for that email address.'
          : 'Could not send a password reset email. Check the email address and try again.',
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6"
      style={{
        background: '#FBF9F4',
        color: '#22261B',
        colorScheme: 'light',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <motion.section
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="grid w-full max-w-6xl overflow-hidden rounded-2xl border shadow-2xl md:min-h-[680px] md:grid-cols-2"
        style={{ background: '#fff', borderColor: '#E3DDC8', boxShadow: '0 28px 90px rgba(35,42,27,0.16)' }}
      >
        <section className="relative hidden min-h-[620px] md:block lg:min-h-[680px]" aria-label="Resort photography">
          <ImageSlider images={RESORT_SLIDES} interval={5000} />
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-9 xl:p-12">
            <a href="/home" aria-label="Lawiswis Kawayan Garden Resort home" className="pointer-events-auto inline-flex w-fit rounded-lg bg-[#263020]/35 p-3 backdrop-blur-sm">
              <img src={RESORT_LOGO} alt="Lawiswis Kawayan Garden Resort" className="h-12 w-auto max-w-[220px] object-contain" />
            </a>
            <div className="max-w-md text-white">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#E8D5A9]">Lawiswis Kawayan Garden Resort</p>
              <h1 className="font-serif text-4xl font-medium leading-tight xl:text-5xl">Welcome to a place to unwind.</h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/85">
                A quiet retreat in Calumpit, Bulacan, where nature, comfort, and warm Filipino hospitality come together.
              </p>
              <p className="mt-6 text-xs text-white/75">402 Brgy. Buguion, Calumpit, Bulacan</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[620px] items-center justify-center px-6 py-12 sm:px-12 lg:min-h-[680px]">
          <div className="w-full max-w-sm">
            <a href="/home" className="mb-10 inline-flex items-center gap-2 text-xs font-medium text-[#68715D] transition hover:text-[#3B4530]">
              <ArrowLeft size={15} aria-hidden="true" />
              Back to resort website
            </a>
            <div className="mb-8">
              <img src={RESORT_LOGO} alt="Lawiswis Kawayan Garden Resort" className="mb-7 h-10 w-auto max-w-[190px] rounded-md bg-[#3B4530] px-3 py-1.5 object-contain md:hidden" />
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7C8A5E]">Staff portal</p>
              <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#22261B] sm:text-[34px]">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-[#73776A]">Sign in to manage reservations and resort operations.</p>
            </div>

            {error && (
              <div role="alert" className="mb-5 rounded-lg border border-[#F0C9C2] bg-[#FFF4F1] px-4 py-3 text-sm leading-5 text-[#9D3C2F]">
                {error}
              </div>
            )}
            {resetSent && (
              <div role="status" className="mb-5 rounded-lg border border-[#C9DDC5] bg-[#F2F8EF] px-4 py-3 text-sm leading-5 text-[#3B6537]">
                Password reset instructions have been sent to your email.
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="staff-email" className="mb-2 block text-sm font-medium text-[#393D32]">Email address</label>
                <div className="relative">
                  <Mail size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#939786]" />
                  <input
                    id="staff-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 w-full rounded-lg border border-[#DCDCCF] bg-white pl-11 pr-4 text-sm text-[#22261B] outline-none transition placeholder:text-[#A3A597] focus:border-[#7C8A5E] focus:ring-4 focus:ring-[#7C8A5E]/15"
                    placeholder="name@lawiswiskawayanresort.com"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="staff-password" className="block text-sm font-medium text-[#393D32]">Password</label>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={resetLoading}
                    className="text-xs font-semibold text-[#536344] underline-offset-4 transition hover:text-[#303D27] hover:underline disabled:opacity-60"
                  >
                    {resetLoading ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>
                <div className="relative">
                  <LockKeyhole size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#939786]" />
                  <input
                    id="staff-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 w-full rounded-lg border border-[#DCDCCF] bg-white pl-11 pr-12 text-sm text-[#22261B] outline-none transition placeholder:text-[#A3A597] focus:border-[#7C8A5E] focus:ring-4 focus:ring-[#7C8A5E]/15"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-[#858A7A] transition hover:bg-[#F4F2EB] hover:text-[#3B4530]"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-[#3B4530] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2F3826] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7C8A5E]/30 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {loading ? 'Signing in...' : 'Sign in to staff portal'}
              </button>
            </form>

            <div className="mt-8 border-t border-[#EEECE4] pt-5 text-center text-xs leading-5 text-[#858879]">
              Authorized resort staff only. Need access? Contact your administrator.
            </div>
          </div>
        </section>
      </motion.section>
    </main>
  );
}