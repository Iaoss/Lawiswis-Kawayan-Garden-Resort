import React, { useEffect, useState, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';

const GREEN = '#2d5a1b';
const MID_GREEN = '#6aab2e';
const YELLOW_GREEN = '#c8d916';
const TEAL = '#2d5a1b';
const DARK_TEAL = '#1e3d10';
const GOLD = '#c8d916';
const LIGHT = '#f2f7eb';
const ACCENT = '#c8d916';

const BambooLogo = ({ size = 36, color = '#fff' }) => (
  <svg width={size * 0.82} height={size} viewBox="0 0 36 44" fill="none">
    <rect x="4" y="0" width="5" height="44" rx="2.5" fill={color}/>
    <rect x="4" y="8" width="8" height="3" rx="1.5" fill={color} opacity="0.7"/>
    <rect x="4" y="20" width="10" height="3" rx="1.5" fill={color} opacity="0.7"/>
    <rect x="4" y="32" width="7" height="3" rx="1.5" fill={color} opacity="0.7"/>
    <rect x="14" y="4" width="5" height="40" rx="2.5" fill={color} opacity="0.85"/>
    <rect x="14" y="12" width="9" height="3" rx="1.5" fill={color} opacity="0.6"/>
    <rect x="14" y="24" width="11" height="3" rx="1.5" fill={color} opacity="0.6"/>
    <rect x="25" y="2" width="4" height="38" rx="2" fill={color} opacity="0.65"/>
    <rect x="25" y="14" width="8" height="2.5" rx="1.25" fill={color} opacity="0.5"/>
    <rect x="25" y="26" width="9" height="2.5" rx="1.25" fill={color} opacity="0.5"/>
  </svg>
);

const NavDropdown = ({ label, items, dark = false }) => {
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
        style={{ background: 'none', border: 'none', color: dark ? '#333' : '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0' }}>
        {label} <span style={{ fontSize: '10px', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, background: '#fff', borderRadius: '10px', padding: '8px 0', minWidth: '220px', boxShadow: '0 16px 40px rgba(0,0,0,0.15)', zIndex: 200, border: '1px solid #e5e7eb' }}>
          {items.map(item => (
            <div key={item.label}
              onClick={() => { window.location.href = item.path; setOpen(false); }}
              style={{ padding: '10px 18px', color: '#374151', fontSize: '12px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.background = LIGHT}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const photos = {
  hero: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80',
  pool: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80',
  garden: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80',
  villa: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80',
  spa: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80',
  dining: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
  bamboo: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&q=80',
  room1: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
  room2: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80',
  room3: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
  about: 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=800&q=80',
  team: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&q=80',
};

/* ─────────────────────────────────────────────
   TESTIMONIALS DATA
───────────────────────────────────────────── */
const allTestimonials = [
  {
    text: 'The bamboo garden is absolutely breathtaking! We loved every moment of our stay. Perfect for families and so peaceful.',
    name: 'Maria Santos',
    role: 'Family Guest',
    type: 'Family Stay',
    avatar: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'Best resort in Bulacan! Staff were so welcoming, food was amazing. Our team-building event ran perfectly start to finish.',
    name: 'Jose Reyes',
    role: 'HR Manager',
    type: 'Corporate',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'A truly serene getaway just an hour from Manila. The spa was heavenly and the rooms were spotlessly clean. So unique!',
    name: 'Ana Cruz',
    role: 'Weekend Guest',
    type: 'Couple',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'Perfect honeymoon venue! The villa exceeded all expectations. Garden views at sunrise were absolutely romantic.',
    name: 'Robert Lim',
    role: 'Honeymoon Suite',
    type: 'Couple',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'The function hall was beautifully set up. Guests were amazed by the bamboo garden backdrop for our celebration.',
    name: 'Lorraine Reyes',
    role: 'Event Organizer',
    type: 'Events',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'Lawiswis Kawayan is our go-to resort in Bulacan. The garden is gorgeous, the pool is clean, and the whole vibe is so relaxing.',
    name: 'Kevin Manalo',
    role: 'Local Guest',
    type: 'Recreation',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'We celebrated my parents\' anniversary here and the staff went above and beyond to make it memorable. Very family-friendly.',
    name: 'Christine Bautista',
    role: 'Celebration Guest',
    type: 'Family Stay',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'Our company seminar was a huge success. The peaceful environment helped our team focus and the catering was excellent.',
    name: 'Paolo Villanueva',
    role: 'Project Lead',
    type: 'Corporate',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
  {
    text: 'The morning garden walk with dew on the bamboo leaves was magical. Reminded me why these nature escapes matter so much.',
    name: 'Grace Ocampo',
    role: 'Nature Lover',
    type: 'Recreation',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=faces',
    stars: 5,
  },
];

/* ─────────────────────────────────────────────
   SINGLE SCROLLING COLUMN
───────────────────────────────────────────── */
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
        if (lastTimeRef.current !== null) {
          const delta = now - lastTimeRef.current;
          offsetRef.current += delta / duration * 100;
        }
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
        <div key={idx} style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 12px rgba(45,90,27,0.07)',
          flexShrink: 0,
          width: '280px',
        }}>
          {/* type badge */}
          <span style={{
            display: 'inline-block', fontSize: '9px', fontWeight: '700',
            letterSpacing: '0.07em', textTransform: 'uppercase',
            background: LIGHT, color: GREEN,
            padding: '2px 9px', borderRadius: '50px', marginBottom: '8px',
          }}>{r.type}</span>

          {/* stars */}
          <div style={{ color: YELLOW_GREEN, fontSize: '13px', marginBottom: '10px', letterSpacing: '2px' }}>
            {'★'.repeat(r.stars)}
          </div>

          {/* text */}
          <p style={{ fontSize: '12px', color: '#374151', lineHeight: '1.75', fontStyle: 'italic', marginBottom: '14px' }}>
            "{r.text}"
          </p>

          {/* author */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
            <img
              src={r.avatar} alt={r.name}
              style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${LIGHT}`, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: '700', fontSize: '12px', color: '#111', lineHeight: '1.2' }}>{r.name}</div>
              <div style={{ fontSize: '10px', color: '#9ca3af' }}>{r.role}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────
   TESTIMONIALS SECTION (3 animated columns)
───────────────────────────────────────────── */
const TestimonialsSection = () => {
  const [hoveredCol, setHoveredCol] = useState(null);

  const col1 = allTestimonials.slice(0, 3);
  const col2 = allTestimonials.slice(3, 6);
  const col3 = allTestimonials.slice(6, 9);

  const stats = [
    { val: '4.9/5', label: 'Overall Rating' },
    { val: '98%',   label: 'Satisfaction' },
    { val: '1,200+', label: 'Reviews' },
    { val: '500+',  label: 'Events Hosted' },
  ];

  return (
    <div style={{ background: '#f8fdf4', padding: '80px 0' }}>
      <div className="section-container">

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <div style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>
            Testimonials
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#111', fontFamily: "'Poppins', sans-serif", marginBottom: '12px' }}>
            Genuine Reviews from<br />Our Garden Guests
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '440px', margin: '0 auto 24px' }}>
            See what families, corporate teams, and weekend travelers say about their time at Lawiswis Kawayan.
          </p>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '32px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {stats.map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '800', color: GREEN, fontFamily: "'Poppins', sans-serif" }}>{s.val}</div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 scrolling columns with fade mask */}
        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          maxHeight: '660px',
          overflow: 'hidden',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 16%, black 84%, transparent)',
          maskImage: 'linear-gradient(to bottom, transparent, black 16%, black 84%, transparent)',
        }}>

          {/* Column 1 — always visible */}
          <div
            onMouseEnter={() => setHoveredCol(0)}
            onMouseLeave={() => setHoveredCol(null)}
            style={{ flexShrink: 0 }}
          >
            <TestimonialColumn items={col1} duration={18000} paused={hoveredCol === 0} />
          </div>

          {/* Column 2 — hidden on small screens via inline media workaround */}
          <div
            className="testi-col-md"
            onMouseEnter={() => setHoveredCol(1)}
            onMouseLeave={() => setHoveredCol(null)}
            style={{ flexShrink: 0 }}
          >
            <TestimonialColumn items={col2} duration={22000} paused={hoveredCol === 1} />
          </div>

          {/* Column 3 — hidden unless large screen */}
          <div
            className="testi-col-lg"
            onMouseEnter={() => setHoveredCol(2)}
            onMouseLeave={() => setHoveredCol(null)}
            style={{ flexShrink: 0 }}
          >
            <TestimonialColumn items={col3} duration={20000} paused={hoveredCol === 2} />
          </div>
        </div>

        {/* Responsive style injection */}
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
   MAIN HOME COMPONENT
───────────────────────────────────────────── */
export default function Home() {
  const [rooms, setRooms] = useState([]);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!document.querySelector('link[href*="fonts.googleapis"]')) {
      const f = document.createElement('link');
      f.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap';
      f.rel = 'stylesheet'; document.head.appendChild(f);
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

    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const services = [
    { icon: 'ti-palette', label: 'Custom Landscape', sub: 'Aesthetic Design' },
    { icon: 'ti-tool', label: 'Professional', sub: 'Installation Services' },
    { icon: 'ti-refresh', label: 'Maintenance', sub: 'Programs' },
    { icon: 'ti-leaf', label: 'Eco-Friendly', sub: 'Gardening Practices' },
  ];

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#fff', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* TOP INFO BAR */}
      <div className="responsive-nav" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '7px 20px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '11px', color: '#6b7280' }}>
          <span><i className="ti ti-map-pin" style={{ fontSize: '12px', marginRight: '5px', color: MID_GREEN }} />402 Brgy. Buguion, Calumpit, Bulacan, PH</span>
          <span><i className="ti ti-phone" style={{ fontSize: '12px', marginRight: '5px', color: MID_GREEN }} />0917 811 2332</span>
          <span><i className="ti ti-mail" style={{ fontSize: '12px', marginRight: '5px', color: MID_GREEN }} />info@lawiswiskawayanresort.com</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: '#6b7280', alignItems: 'center' }}>
          <span>Follow Us:</span>
          {['ti-brand-facebook', 'ti-brand-instagram', 'ti-brand-youtube'].map(ic => (
            <i key={ic} className={`ti ${ic}`} style={{ fontSize: '15px', cursor: 'pointer', color: GREEN }} />
          ))}
        </div>
      </div>

      {/* STICKY NAVBAR */}
      <nav className="responsive-nav" style={{
        background: scrolled ? GREEN : '#fff',
        padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '68px',
        position: 'sticky', top: 0, zIndex: 100,
        transition: 'background 0.3s, box-shadow 0.3s',
        boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
        borderBottom: scrolled ? 'none' : '1px solid #e5e7eb',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>
          <BambooLogo size={36} color={scrolled ? '#fff' : GREEN} />
          <div>
            <div style={{ color: scrolled ? '#fff' : GREEN, fontWeight: '700', fontSize: '16px', lineHeight: 1.1, fontFamily: "'Poppins', sans-serif" }}>Lawiswis Kawayan</div>
            <div style={{ color: scrolled ? YELLOW_GREEN : MID_GREEN, fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: "'Poppins', sans-serif" }}>Garden Resort</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '28px', alignItems: 'center' }}>
          {['HOME', 'OUR AMENITIES'].map(label => (
            <button key={label}
              onClick={() => window.location.href = label === 'HOME' ? '/home' : '/about'}
              style={{ background: 'none', border: 'none', color: scrolled ? '#fff' : '#333', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              {label}
            </button>
          ))}
          <NavDropdown dark={!scrolled} label="OUR STORY" items={[
            { label: 'About Us', path: '/about' },
            { label: 'Certifications & Awards', path: '/about' },
            { label: 'Contact Us', path: '/contact' },
          ]} />
          <NavDropdown dark={!scrolled} label="OUR ROOMS" items={[
            { label: 'Regular Rooms', path: '/rooms' },
            { label: 'Suite Rooms', path: '/rooms' },
          ]} />
          <NavDropdown dark={!scrolled} label="CUSTOMER CARE" items={[
            { label: 'FAQs', path: '/contact' },
            { label: 'Safety Guidelines', path: '/contact' },
            { label: 'Cancellation Policy', path: '/contact' },
            { label: 'Privacy Policy', path: '/contact' },
          ]} />
        </div>

        <button onClick={() => window.location.href = '/rooms'}
          style={{ background: MID_GREEN, color: '#fff', border: 'none', borderRadius: '25px', padding: '10px 24px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', gap: '8px' }}>
          Get Started <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>→</span>
        </button>
      </nav>

      {/* HERO */}
      <div style={{ position: 'relative', height: '90vh', minHeight: '580px', overflow: 'hidden' }}>
        <img src={photos.hero} alt="Resort" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,30,10,0.52)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
          <div style={{ maxWidth: '720px' }}>
            <h1 style={{ color: '#fff', fontSize: '58px', fontWeight: '800', lineHeight: 1.1, marginBottom: '20px', fontFamily: "'Poppins', sans-serif" }}>
              Transform Your Outdoor<br />Space Into Paradise
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: '1.9', margin: '0 auto 32px', maxWidth: '500px', fontFamily: "'Poppins', sans-serif" }}>
              Experience the natural beauty of bamboo gardens, tranquil pools, and world-class hospitality at Lawiswis Kawayan Garden Resort.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'center' }}>
              <button onClick={() => window.location.href = '/rooms'}
                style={{ background: YELLOW_GREEN, color: '#1a2e1a', border: 'none', borderRadius: '30px', padding: '13px 34px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', gap: '8px' }}>
                Get Started <span style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>→</span>
              </button>
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: '80px', right: '80px', background: '#fff', borderRadius: '16px', padding: '16px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
          <div style={{ fontSize: '22px', fontWeight: '700', color: GREEN, fontFamily: "'Poppins', sans-serif" }}>4.9 ⭐</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>from 1,200+ reviews</div>
        </div>
      </div>

      {/* SERVICE ICONS STRIP */}
      <div style={{ background: '#fff', boxShadow: '0 4px 30px rgba(0,0,0,0.08)', position: 'relative', zIndex: 10 }}>
        <div className="section-container responsive-grid-4">
          {services.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '28px 24px', borderRight: i < 3 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = LIGHT}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: '22px', color: MID_GREEN }} />
              </div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#111', marginBottom: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>{s.sub}</div>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px', lineHeight: 1.6 }}>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OUR CLIENTS */}
      <div className="section-container" style={{ margin: '80px auto' }}>
        <div className="responsive-grid-2" style={{ gap: '60px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>Our Clients</div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#111', lineHeight: 1.2, marginBottom: '16px', fontFamily: "'Poppins', sans-serif" }}>Our Outstanding Client</h2>
            <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.9', marginBottom: '28px' }}>
              We take pride in serving families, corporate teams, and event groups from across the Philippines. Our guests return year after year for our unique bamboo ambiance and exceptional service.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              {['Ayala Land', 'SM Hotels', 'Jollibee Group', 'BDO', 'Globe Telecom'].map(c => (
                <div key={c} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 16px', fontSize: '11px', fontWeight: '600', color: '#6b7280' }}>{c}</div>
              ))}
              <div style={{ background: MID_GREEN, borderRadius: '8px', padding: '8px 16px', fontSize: '11px', fontWeight: '700', color: '#fff' }}>+24 More</div>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <img src={photos.team} alt="Guest" style={{ width: '100%', height: '340px', objectFit: 'cover', borderRadius: '20px' }} />
            <div style={{ position: 'absolute', bottom: '-20px', left: '-20px', background: '#fff', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid #f3f4f6', maxWidth: '260px' }}>
              <div style={{ color: YELLOW_GREEN, fontSize: '28px', lineHeight: 1, marginBottom: '8px' }}>"</div>
              <p style={{ fontSize: '12px', color: '#374151', lineHeight: 1.7, margin: '0 0 10px', fontStyle: 'italic' }}>The bamboo gardens are absolutely breathtaking — a perfect escape from the city.</p>
              <div style={{ fontSize: '11px', fontWeight: '600', color: GREEN }}>— Maria Santos, Guest</div>
            </div>
            <div style={{ position: 'absolute', top: '16px', right: '16px', background: MID_GREEN, borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ color: '#fff', fontWeight: '800', fontSize: '18px', lineHeight: 1 }}>99</div>
              <div style={{ color: YELLOW_GREEN, fontSize: '8px' }}>Rating</div>
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="section-container" style={{ margin: '0 auto 80px' }}>
        <div className="responsive-grid-4" style={{ background: LIGHT, borderRadius: '20px', overflow: 'hidden', border: '1px solid #d8eacc' }}>
          {[
            { value: '15+', label: 'Years of Experience', icon: 'ti-trophy' },
            { value: '20+', label: 'Certified Staff', icon: 'ti-certificate' },
            { value: '500+', label: 'Garden Projects', icon: 'ti-plant-2' },
            { value: '30+', label: 'Award Winning', icon: 'ti-medal' },
          ].map((s, i) => (
            <div key={s.label} style={{ textAlign: 'center', padding: '36px 20px', borderRight: i < 3 ? '1px solid #d8eacc' : 'none' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '14px', background: MID_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: '22px', color: '#fff' }} />
              </div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: GREEN, fontFamily: "'Poppins', sans-serif" }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ABOUT */}
      <div className="section-container responsive-grid-2" style={{ margin: '0 auto 90px', gap: '60px', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>About</div>
          <h2 style={{ fontSize: '34px', fontWeight: '700', color: '#111', lineHeight: 1.2, marginBottom: '16px', fontFamily: "'Poppins', sans-serif" }}>
            Growing Beautiful<br />Spaces for Over a Decade
          </h2>
          <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.9', marginBottom: '16px' }}>
            Welcome to <strong style={{ color: GREEN }}>Lawiswis Kawayan Garden Resort</strong> — your peaceful getaway where bamboo gardens, nature, and relaxation meet. Located in Calumpit, Bulacan, we've been a haven since 2006.
          </p>
          <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.9', marginBottom: '28px' }}>
            Our name comes from a cherished song taught by our founder's late father. Like the song, our resort speaks of love, nature, and memories that last a lifetime.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button onClick={() => window.location.href = '/about'}
              style={{ background: MID_GREEN, color: '#fff', border: 'none', borderRadius: '25px', padding: '12px 28px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              Discover More →
            </button>
            <button onClick={() => window.location.href = '/rooms'}
              style={{ background: '#fff', color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: '25px', padding: '12px 28px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              View Rooms
            </button>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <img src={photos.garden} alt="Garden" style={{ width: '100%', height: '420px', objectFit: 'cover', borderRadius: '20px' }} />
          <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', background: '#fff', borderRadius: '16px', padding: '16px 20px', boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: '700', fontSize: '20px', color: GREEN }}>Est. 2006</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Calumpit, Bulacan</div>
          </div>
          <div style={{ position: 'absolute', top: '-15px', left: '-15px', background: MID_GREEN, borderRadius: '12px', padding: '12px 16px' }}>
            <span style={{ fontSize: '22px' }}>🎋</span>
          </div>
        </div>
      </div>

      {/* SERVICES GRID */}
      <div style={{ background: LIGHT, padding: '80px 0' }}>
        <div className="section-container">
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <div style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>Services</div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#111', fontFamily: "'Poppins', sans-serif" }}>Complete Landscaping Services<br />for Every Garden Dream</h2>
          </div>
          <div className="responsive-grid-3" style={{ gap: '20px' }}>
            {[
              { img: photos.pool,   icon: 'ti-ripple',   title: 'Swimming Pool',      desc: 'Adult and kiddie pools with bamboo poolside cabanas for the whole family.' },
              { img: photos.spa,    icon: 'ti-heart',    title: 'Spa & Wellness',     desc: 'Lawiswis Kawayan Spa — a tranquil haven for relaxation and rejuvenation.' },
              { img: photos.dining, icon: 'ti-chef-hat', title: 'Fine Dining',        desc: 'Function and dining halls for meals, events, and special celebrations.' },
              { img: photos.bamboo, icon: 'ti-trees',    title: 'Bamboo Gardens',     desc: 'Explore our lush bamboo garden paths that inspired our resort\'s name.' },
              { img: photos.villa,  icon: 'ti-building', title: 'Luxury Villas',      desc: 'Main villa and premium suites for romantic getaways and family stays.' },
              { img: photos.about,  icon: 'ti-star',     title: 'Events & Functions', desc: 'Versatile spaces for weddings, reunions, and corporate gatherings.' },
            ].map(a => (
              <div key={a.title} style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ height: '160px', overflow: 'hidden' }}>
                  <img src={a.img} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.06)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                </div>
                <div style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`ti ${a.icon}`} style={{ fontSize: '16px', color: MID_GREEN }} />
                    </div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#111' }}>{a.title}</div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.7', margin: '0 0 14px' }}>{a.desc}</p>
                  <button onClick={() => window.location.href = '/about'}
                    style={{ background: 'transparent', border: `1px solid ${MID_GREEN}`, color: MID_GREEN, borderRadius: '8px', padding: '7px 16px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Learn More →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROOMS */}
      <div className="section-container" style={{ margin: '80px auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div>
            <div style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>Accommodations</div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#111', fontFamily: "'Poppins', sans-serif" }}>Available Rooms</h2>
          </div>
          <button onClick={() => window.location.href = '/rooms'}
            style={{ background: LIGHT, color: GREEN, border: `1px solid ${GREEN}`, borderRadius: '10px', padding: '10px 20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            View All Rooms →
          </button>
        </div>
        {rooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: LIGHT, borderRadius: '16px', color: '#9ca3af' }}>No rooms available right now.</div>
        ) : (
          <div className="responsive-grid-3" style={{ gap: '24px' }}>
            {rooms.slice(0, 3).map((room, i) => (
              <div key={room.id} style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)'; }}>
                <div style={{ position: 'relative', height: '200px', overflow: 'hidden' }}>
                  <img src={[photos.room1, photos.room2, photos.room3][i % 3]} alt={`Room ${room.roomNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', top: '12px', left: '12px', background: YELLOW_GREEN, borderRadius: '6px', padding: '4px 10px', fontSize: '10px', fontWeight: '700', color: '#1a2e1a' }}>Available</div>
                </div>
                <div style={{ padding: '18px' }}>
                  <div style={{ fontWeight: '700', fontSize: '16px', color: '#111', marginBottom: '4px' }}>Room {room.roomNumber}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>{room.amenities || 'AC, TV, WiFi, Hot Shower'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '22px', fontWeight: '800', color: GREEN }}>₱{Number(room.price).toLocaleString()}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>/night</span>
                    </div>
                    <button onClick={() => window.location.href = `/book/${room.id}`}
                      style={{ background: MID_GREEN, color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 18px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                      Book Now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TESTIMONIALS (animated 3-column scroll) ── */}
      <TestimonialsSection />

      {/* CTA BANNER */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <img src={photos.bamboo} alt="Garden" style={{ width: '100%', height: '300px', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,30,10,0.80)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '0 20px' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: YELLOW_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>Start Your Garden Journey</div>
            <h2 style={{ fontSize: '34px', fontWeight: '700', color: '#fff', marginBottom: '8px', fontFamily: "'Poppins', sans-serif" }}>Start Your Garden<br />Transformation Journey Now</h2>
          </div>
          <button onClick={() => window.location.href = '/rooms'}
            style={{ background: YELLOW_GREEN, color: '#1a2e1a', border: 'none', borderRadius: '30px', padding: '14px 36px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap', flexShrink: 0, marginTop: '20px' }}>
            Schedule Free Consultation →
          </button>
        </div>
      </div>

      {/* BLOG */}
      <div className="section-container" style={{ margin: '80px auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div>
            <div style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>Blog</div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#111', fontFamily: "'Poppins', sans-serif" }}>Your Complete Guide<br />to Beautiful Gardens</h2>
          </div>
          <button style={{ background: MID_GREEN, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            Browse More →
          </button>
        </div>
        <div className="responsive-grid-3" style={{ gap: '20px' }}>
          {[
            { img: photos.pool,   cat: 'Pool & Aquatics', date: 'Jun 15, 2026', title: 'Spring Preparation: 10 Essential Tips for a Thriving Season' },
            { img: photos.garden, cat: 'Landscaping',     date: 'Jun 12, 2026', title: 'Choosing the Right Plants for Your Climate Zone' },
            { img: photos.spa,    cat: 'Wellness',        date: 'Jun 11, 2026', title: 'Smart Irrigation: Water-Saving Tips That Keep Gardens Healthy' },
            { img: photos.bamboo, cat: 'Sustainability',  date: 'Jun 10, 2026', title: 'Summer Lawn Care: Keeping Grass Green During Heat Impact' },
            { img: photos.villa,  cat: 'Design',          date: 'Jun 8,  2026', title: 'Container Gardening for Small Spaces: Ideas That Actually Work' },
            { img: photos.dining, cat: 'Organic Living',  date: 'Jun 7,  2026', title: 'Organic Pest Control: Natural Solutions That Actually Work' },
          ].map(b => (
            <div key={b.title} style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <div style={{ height: '140px', overflow: 'hidden' }}>
                <img src={b.img} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
              </div>
              <div style={{ padding: '14px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ background: LIGHT, color: MID_GREEN, fontSize: '9px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px' }}>{b.cat}</span>
                  <span style={{ fontSize: '10px', color: '#9ca3af' }}>{b.date}</span>
                </div>
                <div style={{ fontWeight: '600', fontSize: '12px', color: '#111', lineHeight: 1.5, marginBottom: '10px' }}>{b.title}</div>
                <span style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '600' }}>Read More →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NEWSLETTER */}
      <div style={{ background: LIGHT, padding: '60px 0' }}>
        <div className="section-container" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: MID_GREEN, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>Newsletter</div>
          <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#111', marginBottom: '10px', fontFamily: "'Poppins', sans-serif" }}>Stay Updated with Our Latest News</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>Get gardening tips, resort updates, and exclusive offers delivered to your inbox.</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', maxWidth: '480px', margin: '0 auto' }}>
            <input type="email" placeholder="Enter your email address"
              style={{ flex: '1 1 240px', minWidth: '180px', border: '1px solid #d1d5db', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', outline: 'none', fontFamily: "'Poppins', sans-serif" }} />
            <button style={{ background: YELLOW_GREEN, color: '#1a2e1a', border: 'none', borderRadius: '10px', padding: '12px 24px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap', flexShrink: 0 }}>
              Subscribe
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: GREEN, color: 'rgba(255,255,255,0.7)', padding: '60px 20px 30px' }}>
        <div className="section-container responsive-grid-4" style={{ margin: '0 auto', gap: '40px', marginBottom: '40px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <BambooLogo size={34} color="#fff" />
              <div>
                <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px', fontFamily: "'Poppins', sans-serif" }}>Lawiswis Kawayan</div>
                <div style={{ color: YELLOW_GREEN, fontSize: '10px', letterSpacing: '1px' }}>Garden Resort</div>
              </div>
            </div>
            <p style={{ fontSize: '12px', lineHeight: '1.9', maxWidth: '260px' }}>Your serene bamboo garden getaway in Calumpit, Bulacan. Where nature, tradition, and comfort meet.</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              {['ti-brand-facebook', 'ti-brand-instagram', 'ti-brand-youtube'].map(ic => (
                <div key={ic} style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <i className={`ti ${ic}`} style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)' }} />
                </div>
              ))}
            </div>
          </div>
          {[
            { title: 'Quick Links', links: ['Home', 'Rooms', 'About', 'Contact', 'Cancellation Policy'] },
            { title: 'Services', links: ['Custom Landscape', 'Lawn Care', 'Garden Installation', 'Outdoor Living', 'Seasonal Maintenance'] },
            { title: 'Contact', links: ['402 Brgy. Buguion, Calumpit, Bulacan', '0917 811 2332', 'info@lawiswiskawayanresort.com'] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ color: '#fff', fontWeight: '600', fontSize: '13px', marginBottom: '16px' }}>{col.title}</div>
              {col.links.map((l, i) => <div key={i} style={{ fontSize: '12px', marginBottom: '8px', cursor: 'pointer', lineHeight: '1.6' }}>{l}</div>)}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
          <span>© 2026 Lawiswis Kawayan Garden Resort. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span style={{ cursor: 'pointer' }}>Privacy Policy</span>
            <span style={{ cursor: 'pointer' }}>Terms & Conditions</span>
          </div>
        </div>
      </footer>
    </div>
  );
}