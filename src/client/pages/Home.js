import React, { useEffect, useState, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';

/* ─────────────────────────────────────────────
   BRAND PALETTE — pulled from the Lawiswis Kawayan
   mark itself (deep bamboo green + warm ivory),
   with a muted brass accent standing in for the
   old neon yellow-green.
───────────────────────────────────────────── */
const FOREST      = '#3B4530'; // primary brand green (logo background)
const FOREST_DEEP = '#232A1B'; // darkest green, footer / scrolled nav
const MOSS        = '#7C8A5E'; // muted mid-green, icons & secondary UI
const BRASS       = '#AD8A52'; // warm accent, CTAs & highlights
const INK         = '#22261B'; // near-black warm text
const CREAM       = '#F4EFE1'; // logo ivory, section backgrounds
const PAPER       = '#FBF9F4'; // near-white section background
const LINE        = '#E3DDC8'; // hairline borders on cream/paper

const SERIF = "'Fraunces', 'Times New Roman', serif";
const SANS  = "'Inter', sans-serif";

/* Real photography from lawiswiskawayanresort.com */
const photos = {
  hero:        'https://lawiswiskawayanresort.com/wp-content/uploads/2020/01/hero192x-scaled.jpg',
  about:       'https://lawiswiskawayanresort.com/wp-content/uploads/2024/09/About-Lawiswis-Kawayan-scaled-1.jpeg',
  welcome:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/09/Welcome-scaled-1.jpeg',
  mainVilla:   'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Main-Villa-07.jpeg',
  paraiso:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Paraiso-03.jpeg',
  ligaya:      'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Ligaya-03.jpeg',
  pool1:       'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/2017-16.jpg',
  pool2:       'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/2017-05.jpg',
  dining1:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/2017-13.jpg',
  dining2:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/2017-11-1.jpg',
  hapag:       'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Hapag-04.jpeg',
  halimuyak:   'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Halimuyak-02.jpeg',
  alfresco:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/09/AL-FRESCO-MOVIE-scaled-1.jpeg',
  garden06:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/2017-06.jpg',
  logoWide:    'https://lawiswiskawayanresort.com/wp-content/uploads/2026/02/logo-white-new-01.png',
  logoFooter:  'https://lawiswiskawayanresort.com/wp-content/uploads/2026/02/OFFICIAL-LOGO-LAWISWIS-KAWAYAN-WHITE-VER-scaled.png',
};

/* Fallback room photography, cycled when Firestore rooms don't carry images */
const roomPhotos = [
  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Himbing-01-1400x700-1.jpeg',
  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Tahimik-02-1400x700-1.jpeg',
  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/MInamahal-01-1400x700-1.jpeg',
  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Panaginip-05.jpeg',
];

/* ─────────────────────────────────────────────
   NAV DROPDOWN
───────────────────────────────────────────── */
const NavDropdown = ({ label, items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', color: '#fff', fontSize: '12px', fontWeight: '500', letterSpacing: '0.04em', cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 0' }}>
        {label} <span style={{ fontSize: '9px', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 14px)', left: 0, background: PAPER, borderRadius: '4px', padding: '6px 0', minWidth: '230px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', zIndex: 200, border: `1px solid ${LINE}` }}>
          {items.map(item => (
            <div key={item.label}
              onClick={() => { window.location.href = item.path; setOpen(false); }}
              style={{ padding: '11px 20px', color: INK, fontSize: '12.5px', cursor: 'pointer', fontFamily: SANS }}
              onMouseEnter={e => e.currentTarget.style.background = CREAM}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   REVEAL — one quiet fade/rise per section intro
───────────────────────────────────────────── */
const Reveal = ({ children, delay = 0, y = 16, style = {} }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { setVisible(true); return; }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : `translateY(${y}px)`,
      transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  );
};

/* ─────────────────────────────────────────────
   TESTIMONIALS
───────────────────────────────────────────── */
const allTestimonials = [
  { text: 'The bamboo garden is absolutely breathtaking! We loved every moment of our stay. Perfect for families and so peaceful.', name: 'Maria Santos', role: 'Family Guest', type: 'Family Stay', avatar: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'Best resort in Bulacan! Staff were so welcoming, food was amazing. Our team-building event ran perfectly start to finish.', name: 'Jose Reyes', role: 'HR Manager', type: 'Corporate', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'A truly serene getaway just an hour from Manila. The spa was heavenly and the rooms were spotlessly clean. So unique!', name: 'Ana Cruz', role: 'Weekend Guest', type: 'Couple', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'Perfect honeymoon venue! The villa exceeded all expectations. Garden views at sunrise were absolutely romantic.', name: 'Robert Lim', role: 'Honeymoon Suite', type: 'Couple', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'The function hall was beautifully set up. Guests were amazed by the bamboo garden backdrop for our celebration.', name: 'Lorraine Reyes', role: 'Event Organizer', type: 'Events', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'Lawiswis Kawayan is our go-to resort in Bulacan. The garden is gorgeous, the pool is clean, and the whole vibe is so relaxing.', name: 'Kevin Manalo', role: 'Local Guest', type: 'Recreation', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'We celebrated my parents\' anniversary here and the staff went above and beyond to make it memorable. Very family-friendly.', name: 'Christine Bautista', role: 'Celebration Guest', type: 'Family Stay', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'Our company seminar was a huge success. The peaceful environment helped our team focus and the catering was excellent.', name: 'Paolo Villanueva', role: 'Project Lead', type: 'Corporate', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&h=80&fit=crop&crop=faces', stars: 5 },
  { text: 'The morning garden walk with dew on the bamboo leaves was magical. Reminded me why these nature escapes matter so much.', name: 'Grace Ocampo', role: 'Nature Lover', type: 'Recreation', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=faces', stars: 5 },
];

const TestimonialColumn = ({ items, duration = 18000, paused = false }) => {
  const trackRef = useRef(null);
  const offsetRef = useRef(0);
  const lastTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const tick = (now) => {
      const track = trackRef.current;
      if (!track) return;
      if (!paused) {
        if (lastTimeRef.current !== null) offsetRef.current += (now - lastTimeRef.current) / duration * 100;
        lastTimeRef.current = now;
        const halfH = track.scrollHeight / 2;
        const px = (offsetRef.current / 100) * halfH % halfH;
        track.style.transform = `translateY(-${px}px)`;
      } else {
        lastTimeRef.current = null;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration, paused]);

  const doubled = [...items, ...items];

  return (
    <div ref={trackRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px', willChange: 'transform' }}>
      {doubled.map((r, idx) => (
        <div key={idx} style={{ background: PAPER, borderRadius: '4px', padding: '22px', border: `1px solid ${LINE}`, flexShrink: 0, width: '280px' }}>
          <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', background: CREAM, color: FOREST, padding: '3px 10px', borderRadius: '3px', marginBottom: '10px', fontFamily: SANS }}>{r.type}</span>
          <div style={{ color: BRASS, fontSize: '13px', marginBottom: '10px', letterSpacing: '2px' }}>{'★'.repeat(r.stars)}</div>
          <p style={{ fontSize: '13px', color: '#4b4a3f', lineHeight: '1.75', fontStyle: 'italic', marginBottom: '16px', fontFamily: SERIF }}>"{r.text}"</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: `1px solid ${LINE}`, paddingTop: '12px' }}>
            <img src={r.avatar} alt={r.name} style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '600', fontSize: '12px', color: INK, lineHeight: '1.2', fontFamily: SANS }}>{r.name}</div>
              <div style={{ fontSize: '10px', color: '#9b9788', fontFamily: SANS }}>{r.role}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const TestimonialsSection = () => {
  const [hoveredCol, setHoveredCol] = useState(null);
  const col1 = allTestimonials.slice(0, 3);
  const col2 = allTestimonials.slice(3, 6);
  const col3 = allTestimonials.slice(6, 9);
  const stats = [
    { val: '4.9/5', label: 'Overall Rating' },
    { val: '98%', label: 'Satisfaction' },
    { val: '1,200+', label: 'Reviews' },
    { val: '500+', label: 'Events Hosted' },
  ];

  return (
    <div style={{ background: CREAM, padding: '90px 0' }}>
      <div className="section-container">
        <Reveal style={{ textAlign: 'center', marginBottom: '52px' }}>
          <div style={{ fontSize: '11px', color: MOSS, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '12px', fontFamily: SANS }}>Guest Stories</div>
          <h2 style={{ fontSize: '34px', fontWeight: '500', color: INK, fontFamily: SERIF, marginBottom: '12px' }}>What Our Garden Guests Say</h2>
          <p style={{ fontSize: '13px', color: '#6b6a5c', maxWidth: '440px', margin: '0 auto 26px', fontFamily: SANS }}>
            Families, corporate teams, and weekend travelers on their time at Lawiswis Kawayan.
          </p>
          <div style={{ display: 'flex', gap: '34px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {stats.map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '600', color: FOREST, fontFamily: SERIF }}>{s.val}</div>
                <div style={{ fontSize: '10px', color: '#9b9788', marginTop: '2px', fontFamily: SANS }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', maxHeight: '660px', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 16%, black 84%, transparent)', maskImage: 'linear-gradient(to bottom, transparent, black 16%, black 84%, transparent)' }}>
          <div onMouseEnter={() => setHoveredCol(0)} onMouseLeave={() => setHoveredCol(null)} style={{ flexShrink: 0 }}>
            <TestimonialColumn items={col1} duration={18000} paused={hoveredCol === 0} />
          </div>
          <div className="testi-col-md" onMouseEnter={() => setHoveredCol(1)} onMouseLeave={() => setHoveredCol(null)} style={{ flexShrink: 0 }}>
            <TestimonialColumn items={col2} duration={22000} paused={hoveredCol === 1} />
          </div>
          <div className="testi-col-lg" onMouseEnter={() => setHoveredCol(2)} onMouseLeave={() => setHoveredCol(null)} style={{ flexShrink: 0 }}>
            <TestimonialColumn items={col3} duration={20000} paused={hoveredCol === 2} />
          </div>
        </div>

        <style>{`
          .testi-col-md { display: flex; }
          .testi-col-lg { display: flex; }
          @media (max-width: 700px)  { .testi-col-md { display: none !important; } .testi-col-lg { display: none !important; } }
          @media (max-width: 1023px) { .testi-col-lg { display: none !important; } }
        `}</style>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   STATIC CONTENT
───────────────────────────────────────────── */
const stayCategories = [
  { icon: 'ti-moon-stars', label: 'Couple Rooms' },
  { icon: 'ti-users', label: 'Family Rooms' },
  { icon: 'ti-crown', label: 'Suites & Villas' },
  { icon: 'ti-droplet', label: 'Spa & Wellness' },
  { icon: 'ti-confetti', label: 'Events & Function Hall' },
];

const explore = [
  { img: photos.pool1, icon: 'ti-ripple', title: 'Pool & Recreation', desc: 'An adult pool (3–6 ft), a kiddie pool, and a bubble pool, plus a poolside bar and shaded cabanas for lounging between dips.' },
  { img: photos.hapag, icon: 'ti-chef-hat', title: 'Dining & Lounging', desc: 'A snack bar, al fresco lounge, and the Garden Resort Cafe — casual meals in the open air, under the bamboo canopy.' },
  { img: photos.alfresco, icon: 'ti-building-pavilion', title: 'Function & Event Spaces', desc: 'An air-conditioned function hall for 150+ guests, a dining hall, and a pavilion built for reunions and celebrations.' },
  { img: photos.halimuyak, icon: 'ti-flower', title: 'Lawiswis Kawayan Spa', desc: 'A quiet dressing area and tea room tucked away from the main grounds — reserved for slowing down.' },
];

const builtFor = [
  { img: photos.mainVilla, title: 'Main Villa', sub: 'Sleeps up to 25' },
  { img: photos.paraiso, title: 'Paraiso Suite', sub: 'Presidential, 2nd floor' },
  { img: photos.ligaya, title: 'Ligaya Suite', sub: 'Family suite for 4' },
];

const newsPosts = [
  { img: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/11/image-wide-post.jpg', cat: 'News', title: 'The Power of Connection: Building Stronger Teams through Nature Retreats' },
  { img: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/11/349573106_214182444757352_8525037380621928322_n.jpg', cat: 'News', title: 'Physical Well-Being and the Benefits of an Active Lifestyle' },
  { img: 'https://lawiswiskawayanresort.com/wp-content/uploads/2020/01/Pavillion-Featured.jpg', cat: 'News', title: 'Prioritizing Mental Health in the Workplace' },
];

/* ─────────────────────────────────────────────
   MAIN HOME COMPONENT
───────────────────────────────────────────── */
export default function Home() {
  const [rooms, setRooms] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [heroIn, setHeroIn] = useState(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setHeroIn(true), reduceMotionRef.current ? 0 : 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!document.querySelector('link[href*="fonts.googleapis"][data-lk-font]')) {
      const f = document.createElement('link');
      f.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap';
      f.rel = 'stylesheet'; f.dataset.lkFont = 'true'; document.head.appendChild(f);
    }
    if (!document.querySelector('link[href*="tabler-icons"]')) {
      const t = document.createElement('link');
      t.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css';
      t.rel = 'stylesheet'; document.head.appendChild(t);
    }

    const fetchRooms = async () => {
      const snap = await getDocs(collection(db, 'rooms'));
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status === 'vacant' || r.status === 'available'));
    };
    fetchRooms();

    const handleScroll = () => { setScrolled(window.scrollY > 80); setScrollY(window.scrollY); };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{ fontFamily: SANS, background: PAPER, minHeight: '100vh', overflowX: 'hidden', opacity: heroIn ? 1 : 0, transition: 'opacity 0.6s ease-out' }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
        }
      `}</style>

      {/* TOP INFO BAR */}
      <div className="responsive-nav" style={{ background: FOREST_DEEP, padding: '7px 20px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', fontSize: '10.5px', color: 'rgba(255,255,255,0.75)', fontFamily: SANS }}>
          <span><i className="ti ti-map-pin" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />402 Brgy. Buguion, Calumpit, Bulacan, PH</span>
          <span><i className="ti ti-phone" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />0917 811 2332</span>
          <span><i className="ti ti-mail" style={{ fontSize: '12px', marginRight: '5px', color: BRASS }} />info@lawiswiskawayanresort.com</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: 'rgba(255,255,255,0.75)', alignItems: 'center' }}>
          {['ti-brand-facebook', 'ti-brand-linkedin'].map(ic => (
            <i key={ic} className={`ti ${ic}`} style={{ cursor: 'pointer' }} />
          ))}
        </div>
      </div>

      {/* STICKY NAVBAR */}
      <nav className="responsive-nav" style={{
        background: scrolled ? FOREST : 'transparent',
        padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '76px', position: 'sticky', top: 0, zIndex: 100,
        transition: 'background 0.3s, box-shadow 0.3s',
        boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.2)' : 'none',
      }}>
        <img
          src={photos.logoWide} alt="Lawiswis Kawayan Garden Resort"
          onClick={() => window.location.href = '/home'}
          style={{ height: '38px', cursor: 'pointer', filter: 'brightness(0) invert(1)' }}
        />

        <div style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
          {['HOME', 'OUR AMENITIES'].map(label => (
            <button key={label}
              onClick={() => window.location.href = label === 'HOME' ? '/home' : '/about'}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '12px', fontWeight: '500', letterSpacing: '0.04em', cursor: 'pointer', fontFamily: SANS }}>
              {label}
            </button>
          ))}
          <NavDropdown label="OUR STORY" items={[
            { label: 'About Us', path: '/about' },
            { label: 'Certifications & Awards', path: '/about' },
            { label: 'Contact Us', path: '/contact' },
          ]} />
          <NavDropdown label="OUR ROOMS" items={[
            { label: 'Regular Rooms', path: '/rooms' },
            { label: 'Suite Rooms', path: '/rooms' },
          ]} />
          <NavDropdown label="CUSTOMER CARE" items={[
            { label: 'FAQs', path: '/contact' },
            { label: 'Safety Guidelines', path: '/contact' },
            { label: 'Health and Wellness', path: '/contact' },
            { label: 'Cancellation Policy', path: '/contact' },
            { label: 'Privacy Policy', path: '/contact' },
          ]} />
        </div>

        <button onClick={() => window.location.href = '/rooms'}
          style={{ background: BRASS, color: '#fff', border: 'none', borderRadius: '3px', padding: '11px 26px', fontSize: '11.5px', fontWeight: '600', letterSpacing: '0.06em', cursor: 'pointer', fontFamily: SANS }}>
          BOOK YOUR STAY
        </button>
      </nav>

      {/* HERO */}
      <div style={{ position: 'relative', height: '92vh', minHeight: '600px', overflow: 'hidden' }}>
        <img src={photos.hero} alt="Lawiswis Kawayan Garden Resort" style={{
          width: '100%', height: '112%', objectFit: 'cover', objectPosition: 'center',
          transform: `translateY(${Math.min(scrollY, 800) * -0.1}px) scale(1.06)`,
          transition: 'transform 0.05s linear', willChange: 'transform',
        }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,25,15,0.55) 0%, rgba(20,25,15,0.35) 45%, rgba(20,25,15,0.7) 100%)' }} />

        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 60px' }}>
          <div style={{ maxWidth: '620px' }}>
            <div style={{
              fontSize: '12px', color: '#e7dfc4', fontWeight: '500', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '18px', fontFamily: SANS,
              opacity: heroIn ? 1 : 0, transform: heroIn ? 'translateY(0)' : 'translateY(14px)', transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1), transform 0.9s cubic-bezier(0.16,1,0.3,1)',
            }}>Since 2006 · Calumpit, Bulacan</div>
            <h1 style={{
              color: '#fff', fontSize: '60px', fontWeight: '500', lineHeight: 1.08, marginBottom: '22px', fontFamily: SERIF,
              opacity: heroIn ? 1 : 0, transform: heroIn ? 'translateY(0)' : 'translateY(18px)',
              transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1) 100ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) 100ms',
            }}>
              The Murmur of<br />Bamboo, an Hour<br />from Manila
            </h1>
            <p style={{
              color: 'rgba(255,255,255,0.82)', fontSize: '14.5px', lineHeight: '1.85', margin: '0 0 34px', maxWidth: '460px', fontFamily: SANS,
              opacity: heroIn ? 1 : 0, transform: heroIn ? 'translateY(0)' : 'translateY(18px)',
              transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1) 220ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) 220ms',
            }}>
              An 18-year-old garden hideaway with 32 cozy rooms, quiet pools, and bamboo-shaded grounds — where work and play sit comfortably side by side.
            </p>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '14px',
              opacity: heroIn ? 1 : 0, transform: heroIn ? 'translateY(0)' : 'translateY(18px)',
              transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1) 340ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) 340ms',
            }}>
              <button onClick={() => window.location.href = '/rooms'}
                style={{ background: BRASS, color: '#fff', border: 'none', borderRadius: '3px', padding: '15px 32px', fontSize: '12.5px', fontWeight: '600', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', gap: '10px', transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                BOOK YOUR STAY <span>→</span>
              </button>
              <button onClick={() => window.location.href = '/about'}
                style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: '3px', padding: '15px 30px', fontSize: '12.5px', fontWeight: '600', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: SANS }}>
                OUR STORY
              </button>
            </div>
          </div>
        </div>

        <div style={{
          position: 'absolute', bottom: '36px', right: '60px', background: 'rgba(255,255,255,0.95)', borderRadius: '4px', padding: '14px 20px',
          opacity: heroIn ? 1 : 0, transform: heroIn ? 'translateY(0)' : 'translateY(18px)',
          transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1) 460ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) 460ms',
        }}>
          <div style={{ fontSize: '20px', fontWeight: '600', color: FOREST, fontFamily: SERIF }}>4.9 ★</div>
          <div style={{ fontSize: '10px', color: '#6b6a5c', marginTop: '2px', fontFamily: SANS }}>from 1,200+ reviews</div>
        </div>
      </div>

      {/* STAY CATEGORY STRIP — overlaps the bottom of the hero */}
      <div className="section-container" style={{ position: 'relative', zIndex: 10, marginTop: '-40px', marginBottom: '0' }}>
        <div className="responsive-grid-5" style={{ background: FOREST, borderRadius: '6px', boxShadow: '0 20px 50px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
          {stayCategories.map((c, i) => (
            <div key={c.label} onClick={() => window.location.href = '/rooms'} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '26px 12px', textAlign: 'center', cursor: 'pointer',
              borderRight: i < stayCategories.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
            }}>
              <i className={`ti ${c.icon}`} style={{ fontSize: '24px', color: '#e7dfc4' }} />
              <span style={{ fontSize: '11px', color: '#fff', fontWeight: '500', letterSpacing: '0.03em', fontFamily: SANS }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ABOUT / OUR STORY */}
      <div className="section-container responsive-grid-2" style={{ margin: '110px auto 100px', gap: '64px', alignItems: 'center' }}>
        <Reveal delay={100} y={24}>
          <div style={{ position: 'relative' }}>
            <img src={photos.about} alt="Lawiswis Kawayan Garden Resort" style={{ width: '100%', height: '440px', objectFit: 'cover', borderRadius: '6px' }} />
            <div style={{ position: 'absolute', bottom: '-22px', right: '-22px', background: PAPER, borderRadius: '6px', padding: '18px 22px', boxShadow: '0 12px 40px rgba(0,0,0,0.14)', border: `1px solid ${LINE}` }}>
              <div style={{ fontWeight: '600', fontSize: '20px', color: FOREST, fontFamily: SERIF }}>Est. 2006</div>
              <div style={{ fontSize: '11px', color: '#6b6a5c', fontFamily: SANS }}>Calumpit, Bulacan</div>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <div style={{ fontSize: '11px', color: MOSS, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '14px', fontFamily: SANS }}>Our Story</div>
          <h2 style={{ fontSize: '34px', fontWeight: '500', color: INK, lineHeight: 1.2, marginBottom: '20px', fontFamily: SERIF }}>
            Named After a Song Our Founder's Father Used to Sing
          </h2>
          <p style={{ color: '#5c5a4c', fontSize: '13.5px', lineHeight: '1.9', marginBottom: '16px', fontFamily: SANS }}>
            Escape the hustle and bustle of city life at Lawiswis Kawayan — a serene hideaway nestled in Calumpit, Bulacan, just an hour's drive from Manila.
          </p>
          <p style={{ color: '#5c5a4c', fontSize: '13.5px', lineHeight: '1.9', marginBottom: '30px', fontFamily: SANS }}>
            Our name, meaning "the murmur of bamboo," comes from a cherished song taught by our founder's late father. Eighteen years on, our 32 rooms still welcome families, corporate teams, and anyone in need of a seamless mix of work and play.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            <button onClick={() => window.location.href = '/about'}
              style={{ background: FOREST, color: '#fff', border: 'none', borderRadius: '3px', padding: '13px 28px', fontSize: '12.5px', fontWeight: '600', letterSpacing: '0.04em', cursor: 'pointer', fontFamily: SANS }}>
              LEARN MORE
            </button>
            <button onClick={() => window.location.href = '/rooms'}
              style={{ background: 'transparent', color: FOREST, border: `1.5px solid ${FOREST}`, borderRadius: '3px', padding: '13px 28px', fontSize: '12.5px', fontWeight: '600', letterSpacing: '0.04em', cursor: 'pointer', fontFamily: SANS }}>
              VIEW ROOMS
            </button>
          </div>
        </Reveal>
      </div>

      {/* STATS BAND */}
      <div className="section-container" style={{ margin: '0 auto 100px' }}>
        <Reveal>
          <div className="responsive-grid-4" style={{ background: CREAM, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${LINE}` }}>
            {[
              { value: '18+', label: 'Years Welcoming Guests' },
              { value: '32', label: 'Cozy Rooms & Suites' },
              { value: '150+', label: 'Pax Function Hall' },
              { value: '60 min', label: 'From Manila' },
            ].map((s, i) => (
              <div key={s.label} style={{ textAlign: 'center', padding: '38px 20px', borderRight: i < 3 ? `1px solid ${LINE}` : 'none' }}>
                <div style={{ fontSize: '32px', fontWeight: '600', color: FOREST, fontFamily: SERIF }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: '#6b6a5c', marginTop: '6px', fontFamily: SANS }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* EXPLORE THE RESORT */}
      <div style={{ background: CREAM, padding: '90px 0' }}>
        <div className="section-container">
          <Reveal style={{ textAlign: 'center', marginBottom: '52px' }}>
            <div style={{ fontSize: '11px', color: MOSS, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '12px', fontFamily: SANS }}>Amenities</div>
            <h2 style={{ fontSize: '34px', fontWeight: '500', color: INK, fontFamily: SERIF }}>Explore the Grounds</h2>
          </Reveal>
          <div className="responsive-grid-2" style={{ gap: '24px' }}>
            {explore.map(a => (
              <div key={a.title} style={{ background: PAPER, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${LINE}`, display: 'flex' }}>
                <div style={{ width: '38%', minWidth: '140px', overflow: 'hidden' }}>
                  <img src={a.img} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div style={{ padding: '22px 24px', flex: 1 }}>
                  <i className={`ti ${a.icon}`} style={{ fontSize: '20px', color: BRASS, marginBottom: '10px', display: 'block' }} />
                  <div style={{ fontWeight: '600', fontSize: '15px', color: INK, marginBottom: '8px', fontFamily: SERIF }}>{a.title}</div>
                  <p style={{ fontSize: '12px', color: '#6b6a5c', lineHeight: '1.75', margin: 0, fontFamily: SANS }}>{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BUILT FOR TOGETHERNESS — dark section */}
      <div style={{ background: FOREST, padding: '90px 0' }}>
        <div className="section-container responsive-grid-2" style={{ gap: '60px', alignItems: 'center', marginBottom: '50px' }}>
          <Reveal>
            <div style={{ fontSize: '11px', color: '#c9c19a', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '14px', fontFamily: SANS }}>Signature Stays</div>
            <h2 style={{ fontSize: '32px', fontWeight: '500', color: '#fff', lineHeight: 1.25, fontFamily: SERIF }}>Built for the Whole Group to Gather</h2>
          </Reveal>
          <Reveal delay={100}>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', lineHeight: '1.9', margin: 0, fontFamily: SANS }}>
              From a two-guest room to a private villa for twenty-five, our largest suites and the Main Villa are built for reunions, retreats, and everything worth celebrating together.
            </p>
          </Reveal>
        </div>
        <div className="responsive-grid-3" style={{ gap: '20px' }}>
          {builtFor.map(b => (
            <div key={b.title} style={{ borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
              <img src={b.img} alt={b.title} style={{ width: '100%', height: '320px', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(15,18,10,0.85) 100%)' }} />
              <div style={{ position: 'absolute', left: '20px', bottom: '18px' }}>
                <div style={{ color: '#fff', fontWeight: '500', fontSize: '17px', fontFamily: SERIF }}>{b.title}</div>
                <div style={{ color: '#e7dfc4', fontSize: '11px', fontFamily: SANS }}>{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURED ROOMS */}
      <div className="section-container" style={{ margin: '100px auto' }}>
        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '44px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', color: MOSS, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '12px', fontFamily: SANS }}>Accommodations</div>
              <h2 style={{ fontSize: '32px', fontWeight: '500', color: INK, fontFamily: SERIF }}>Available Rooms</h2>
            </div>
            <button onClick={() => window.location.href = '/rooms'}
              style={{ background: 'transparent', color: FOREST, border: `1.5px solid ${FOREST}`, borderRadius: '3px', padding: '12px 24px', fontSize: '12px', fontWeight: '600', letterSpacing: '0.04em', cursor: 'pointer', fontFamily: SANS }}>
              VIEW ALL ROOMS
            </button>
          </div>
        </Reveal>
        {rooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '70px', background: CREAM, borderRadius: '6px', color: '#8b8977', fontFamily: SANS, fontSize: '13px' }}>No rooms available right now — check back soon.</div>
        ) : (
          <div className="responsive-grid-3" style={{ gap: '26px' }}>
            {rooms.slice(0, 3).map((room, i) => (
              <div key={room.id} style={{ background: PAPER, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${LINE}`, transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1), box-shadow 0.4s cubic-bezier(0.16,1,0.3,1)' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ position: 'relative', height: '210px', overflow: 'hidden' }}>
                  <img src={roomPhotos[i % roomPhotos.length]} alt={`Room ${room.roomNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', top: '14px', left: '14px', background: BRASS, borderRadius: '3px', padding: '5px 12px', fontSize: '10px', fontWeight: '600', letterSpacing: '0.04em', color: '#fff', fontFamily: SANS }}>AVAILABLE</div>
                </div>
                <div style={{ padding: '22px' }}>
                  <div style={{ fontWeight: '600', fontSize: '17px', color: INK, marginBottom: '6px', fontFamily: SERIF }}>Room {room.roomNumber}</div>
                  <div style={{ fontSize: '12px', color: '#8b8977', marginBottom: '16px', fontFamily: SANS }}>{room.amenities || 'AC, TV, WiFi, Hot Shower'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '21px', fontWeight: '600', color: FOREST, fontFamily: SERIF }}>₱{Number(room.price).toLocaleString()}</span>
                      <span style={{ fontSize: '11px', color: '#9b9788', fontFamily: SANS }}> /night</span>
                    </div>
                    <button onClick={() => window.location.href = `/book/${room.id}`}
                      style={{ background: FOREST, color: '#fff', border: 'none', borderRadius: '3px', padding: '10px 20px', fontSize: '11.5px', fontWeight: '600', letterSpacing: '0.03em', cursor: 'pointer', fontFamily: SANS }}>
                      BOOK NOW
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TESTIMONIALS */}
      <TestimonialsSection />

      {/* CTA BANNER */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <img src={photos.garden06} alt="Bamboo Garden" style={{ width: '100%', height: '320px', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,25,15,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '0 40px', gap: '20px' }}>
          <Reveal style={{ flex: '1 1 340px', minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: '#e7dfc4', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '14px', fontFamily: SANS }}>We Can't Wait to Serve You</div>
            <h2 style={{ fontSize: '32px', fontWeight: '500', color: '#fff', fontFamily: SERIF, margin: 0 }}>Ready for Your Bulacan Getaway?</h2>
          </Reveal>
          <button onClick={() => window.location.href = '/rooms'}
            style={{ background: BRASS, color: '#fff', border: 'none', borderRadius: '3px', padding: '16px 34px', fontSize: '12.5px', fontWeight: '600', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>
            BOOK YOUR STAY →
          </button>
        </div>
      </div>

      {/* NEWS */}
      <div className="section-container" style={{ margin: '100px auto' }}>
        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', color: MOSS, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '12px', fontFamily: SANS }}>Latest News</div>
              <h2 style={{ fontSize: '32px', fontWeight: '500', color: INK, fontFamily: SERIF }}>From the Resort</h2>
            </div>
          </div>
        </Reveal>
        <div className="responsive-grid-3" style={{ gap: '24px' }}>
          {newsPosts.map(b => (
            <div key={b.title} style={{ background: PAPER, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${LINE}`, cursor: 'pointer' }}>
              <div style={{ height: '170px', overflow: 'hidden' }}>
                <img src={b.img} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ padding: '18px' }}>
                <span style={{ background: CREAM, color: FOREST, fontSize: '9.5px', fontWeight: '600', letterSpacing: '0.05em', padding: '4px 10px', borderRadius: '3px', fontFamily: SANS }}>{b.cat}</span>
                <div style={{ fontWeight: '500', fontSize: '14px', color: INK, lineHeight: 1.5, margin: '12px 0', fontFamily: SERIF }}>{b.title}</div>
                <span style={{ fontSize: '11.5px', color: BRASS, fontWeight: '600', fontFamily: SANS }}>Read More →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NEWSLETTER */}
      <div style={{ background: CREAM, padding: '70px 0' }}>
        <Reveal>
          <div className="section-container" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: MOSS, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '12px', fontFamily: SANS }}>Newsletter</div>
            <h2 style={{ fontSize: '28px', fontWeight: '500', color: INK, marginBottom: '12px', fontFamily: SERIF }}>Stay Updated with Our Latest News</h2>
            <p style={{ fontSize: '13px', color: '#6b6a5c', marginBottom: '26px', fontFamily: SANS }}>Resort updates, promos, and stories delivered straight to your inbox.</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', maxWidth: '480px', margin: '0 auto' }}>
              <input type="email" placeholder="Enter your email address"
                style={{ flex: '1 1 240px', minWidth: '180px', border: `1px solid ${LINE}`, borderRadius: '3px', padding: '13px 16px', fontSize: '13px', outline: 'none', fontFamily: SANS, background: PAPER, transition: 'border-color 0.3s' }}
                onFocus={e => e.currentTarget.style.borderColor = FOREST}
                onBlur={e => e.currentTarget.style.borderColor = LINE} />
              <button style={{ background: BRASS, color: '#fff', border: 'none', borderRadius: '3px', padding: '13px 26px', fontSize: '12.5px', fontWeight: '600', letterSpacing: '0.04em', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>
                SUBSCRIBE
              </button>
            </div>
          </div>
        </Reveal>
      </div>

      {/* FOOTER */}
      <footer style={{ background: FOREST_DEEP, color: 'rgba(255,255,255,0.65)', padding: '64px 20px 30px' }}>
        <div className="section-container responsive-grid-4" style={{ margin: '0 auto', gap: '40px', marginBottom: '44px' }}>
          <div>
            <img src={photos.logoFooter} alt="Lawiswis Kawayan Garden Resort" style={{ height: '80px', marginBottom: '18px' }} />
            <p style={{ fontSize: '12px', lineHeight: '1.9', maxWidth: '260px', fontFamily: SANS }}>Your serene bamboo garden getaway in Calumpit, Bulacan. Where nature, tradition, and comfort meet.</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              {['ti-brand-facebook', 'ti-brand-linkedin'].map(ic => (
                <div key={ic} style={{ width: '34px', height: '34px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <i className={`ti ${ic}`} style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)' }} />
                </div>
              ))}
            </div>
          </div>
          {[
            { title: 'Our Story', links: [{ l: 'About Us', p: '/about' }, { l: 'Certifications & Awards', p: '/about' }, { l: 'Contact Us', p: '/contact' }] },
            { title: 'Our Rooms', links: [{ l: 'Regular Rooms', p: '/rooms' }, { l: 'Suite Rooms', p: '/rooms' }] },
            { title: 'Customer Care', links: [{ l: 'FAQs', p: '/contact' }, { l: 'Safety Guidelines', p: '/contact' }, { l: 'Health and Wellness', p: '/contact' }, { l: 'Cancellation Policy', p: '/contact' }, { l: 'Privacy Policy', p: '/contact' }] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ color: '#fff', fontWeight: '500', fontSize: '13px', marginBottom: '18px', fontFamily: SERIF }}>{col.title}</div>
              {col.links.map((l, i) => (
                <div key={i} onClick={() => window.location.href = l.p} style={{ fontSize: '12px', marginBottom: '10px', cursor: 'pointer', lineHeight: '1.6', fontFamily: SANS }}>{l.l}</div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', flexWrap: 'wrap', gap: '10px', fontFamily: SANS }}>
          <span>© 2026 Lawiswis Kawayan Garden Resort. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '18px' }}>
            <span onClick={() => window.location.href = '/contact'} style={{ cursor: 'pointer' }}>Privacy Policy</span>
            <span onClick={() => window.location.href = '/contact'} style={{ cursor: 'pointer' }}>Terms & Conditions</span>
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 900px) {
          .responsive-grid-5 { grid-template-columns: repeat(2, 1fr) !important; }
          .responsive-grid-5 > div:nth-child(5) { border-right: none !important; }
        }
        .responsive-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); }
      `}</style>
    </div>
  );
}