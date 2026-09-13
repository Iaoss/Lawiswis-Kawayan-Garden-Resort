import React from 'react';

const GREEN = '#2d5a27';
const LIGHT_GREEN = '#4a7c3f';
const GOLD = '#c8a84b';
const LIGHT = '#f0f4e8';
const DARK = '#1a2e1a';

const BambooLogo = ({ size = 36 }) => (
  <svg width={size * 0.82} height={size} viewBox="0 0 36 44" fill="none">
    <rect x="4" y="0" width="5" height="44" rx="2.5" fill="currentColor"/>
    <rect x="4" y="8" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.7"/>
    <rect x="4" y="20" width="10" height="3" rx="1.5" fill="currentColor" opacity="0.7"/>
    <rect x="4" y="32" width="7" height="3" rx="1.5" fill="currentColor" opacity="0.7"/>
    <rect x="14" y="4" width="5" height="40" rx="2.5" fill="currentColor" opacity="0.85"/>
    <rect x="14" y="12" width="9" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
    <rect x="14" y="24" width="11" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
    <rect x="25" y="2" width="4" height="38" rx="2" fill="currentColor" opacity="0.65"/>
    <rect x="25" y="14" width="8" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
    <rect x="25" y="26" width="9" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
  </svg>
);

const photos = {
  about:   'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=800&q=80',
  garden:  'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80',
  bamboo:  'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&q=80',
  pool:    'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80',
  spa:     'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80',
  dining:  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
  hero:    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80',
};

const timeline = [
  { year: '2006', title: 'Foundation & Beginnings', sub: 'How it started', desc: 'Lawiswis Kawayan Garden Resort was founded with a vision to create a serene escape from city life, inspired by a cherished song taught by our founder\'s late father.', icon: '🏗' },
  { year: '2008', title: 'First Guest Rooms', sub: 'Building relaxation', desc: 'Constructed our first set of Standard and Deluxe rooms, welcoming our earliest guests and beginning our journey of warm Filipino hospitality.', icon: '🛏' },
  { year: '2011', title: 'Pool & Recreation', sub: 'Expanding amenities', desc: 'Added our stunning bamboo-poolside swimming area and kiddie pool, making Lawiswis Kawayan the perfect family destination in Bulacan.', icon: '🏊' },
  { year: '2014', title: 'Spa & Wellness Center', sub: 'A tranquil haven', desc: 'Opened the Lawiswis Kawayan Spa — a sanctuary dedicated to relaxation and rejuvenation, offering a full range of wellness treatments.', icon: '💆' },
  { year: '2017', title: 'Suites & Villas', sub: 'Luxury expansion', desc: 'Expanded with premium suites and villa accommodations, offering romantic getaways and spacious family-sized luxury rooms in the bamboo gardens.', icon: '🏡' },
  { year: '2020', title: 'Online Booking System', sub: 'Digital transformation', desc: 'Launched our online reservation platform, making it easier than ever for guests to plan and book their perfect garden escape.', icon: '💻' },
  { year: '2023', title: 'Fine Dining & Events Hall', sub: 'Culinary excellence', desc: 'Opened our signature dining and function halls offering authentic Filipino cuisine and hosting weddings, reunions, and corporate events.', icon: '🍽' },
  { year: '2026', title: 'Lawiswis Kawayan Today', sub: 'Growing stronger', desc: 'Today we stand as a premier garden resort with 50+ rooms, world-class amenities, and thousands of happy guests — still rooted in the song that started it all.', icon: '🎋' },
];

export default function About() {
  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#fff', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <div className="responsive-nav" style={{ background: GREEN, padding: '7px 20px', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px' }}>
          <span>📍 Calumpit, Bulacan, Philippines</span>
          <span>📞 +63 XXX XXX XXXX</span>
          <span>✉️ info@lawiswiskawayan.com</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
          <span style={{ cursor: 'pointer' }}>Facebook</span>
          <span style={{ cursor: 'pointer' }}>Instagram</span>
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="responsive-nav" style={{ background: '#fff', padding: '0 20px', justifyContent: 'space-between', height: '70px', boxShadow: '0 2px 20px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>
          <div style={{ color: GREEN }}><BambooLogo size={40} /></div>
          <div>
            <div style={{ color: GREEN, fontWeight: '700', fontSize: '18px', lineHeight: 1.1, fontFamily: 'Georgia, serif' }}>Lawiswis Kawayan</div>
            <div style={{ color: GOLD, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'Georgia, serif' }}>Garden Resort</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '28px' }}>
          {['Home', 'Rooms', 'About', 'Contact'].map(n => (
            <button key={n} onClick={() => window.location.href = `/${n.toLowerCase()}`}
              style={{ background: 'none', border: 'none', color: n === 'About' ? GREEN : '#555', fontSize: '13px', fontWeight: n === 'About' ? '700' : '500', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", borderBottom: n === 'About' ? `2px solid ${GREEN}` : '2px solid transparent', paddingBottom: '4px' }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => window.dispatchEvent(new Event('openGuestChat'))}
            style={{ background: 'transparent', border: `2px solid ${GREEN}`, color: GREEN, borderRadius: '25px', padding: '8px 20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            💬 Chat
          </button>
          <button onClick={() => window.location.href = '/rooms'}
            style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: '25px', padding: '10px 24px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            Book Now
          </button>
        </div>
      </nav>

      {/* HERO BANNER */}
      <div style={{ position: 'relative', height: '420px', overflow: 'hidden' }}>
        <img src={photos.hero} alt="Resort" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 60%' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(18, 42, 18, 0.65)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(200,168,75,0.2)', border: `1px solid ${GOLD}`, borderRadius: '20px', padding: '5px 16px', marginBottom: '16px' }}>
            <span style={{ color: GOLD, fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>🎋 Our Story</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: '50px', fontWeight: '800', lineHeight: 1.1, marginBottom: '14px', fontFamily: 'Georgia, serif' }}>
            About <span style={{ color: GOLD }}>Lawiswis Kawayan</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', lineHeight: 1.8, maxWidth: '520px' }}>
            A peaceful garden resort rooted in love, nature, and a cherished Filipino song — welcoming guests since 2006.
          </p>
        </div>
      </div>

      {/* ABOUT SECTION */}
      <div className="section-container responsive-grid-2" style={{ margin: '80px auto', gap: '70px', alignItems: 'center' }}>
        {/* Image collage */}
        <div style={{ position: 'relative' }}>
          <img src={photos.garden} alt="Garden" style={{ width: '100%', height: '400px', objectFit: 'cover', borderRadius: '20px' }} />
          {/* floating photo */}
          <div style={{ position: 'absolute', bottom: '-24px', right: '-24px', width: '160px', height: '130px', borderRadius: '14px', overflow: 'hidden', border: '4px solid #fff', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
            <img src={photos.bamboo} alt="Bamboo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          {/* Est badge */}
          <div style={{ position: 'absolute', top: '-16px', left: '-16px', background: '#fff', borderRadius: '14px', padding: '14px 18px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: '800', fontSize: '20px', color: GREEN, fontFamily: 'Georgia, serif' }}>Est. 2006</div>
            <div style={{ fontSize: '10px', color: '#6b7280' }}>Calumpit, Bulacan</div>
          </div>
          {/* Green accent */}
          <div style={{ position: 'absolute', top: '50%', left: '-16px', background: GREEN, borderRadius: '10px', padding: '10px 14px', transform: 'translateY(-50%)' }}>
            <div style={{ color: GOLD, fontSize: '22px' }}>🎋</div>
          </div>
        </div>

        {/* Text */}
        <div>
          <div style={{ fontSize: '11px', color: GOLD, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>Welcome to Lawiswis Kawayan</div>
          <h2 style={{ fontSize: '34px', fontWeight: '700', color: '#111', lineHeight: 1.2, marginBottom: '18px', fontFamily: 'Georgia, serif' }}>
            A Serene Bamboo<br />Garden Hideaway
          </h2>
          <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.9', marginBottom: '14px' }}>
            Welcome to <strong style={{ color: GREEN }}>Lawiswis Kawayan Garden Resort</strong> — your peaceful getaway where bamboo gardens, nature, and relaxation meet. Located in Calumpit, Bulacan, we've been a haven for individuals, families, and groups since 2006.
          </p>
          <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.9', marginBottom: '28px' }}>
            Our name comes from a cherished song — <em>"Lawiswis Kawayan"</em> — taught by our founder's late father. Like the song, our resort speaks of love, nature, and memories that last a lifetime. Every corner of our property is designed to bring peace, warmth, and a deep connection to nature.
          </p>
          {/* Stats grid */}
          <div className="responsive-grid-2" style={{ gap: '14px' }}>
            {[
              { icon: '🛏', value: '50+', label: 'Luxury Rooms' },
              { icon: '😊', value: '10k+', label: 'Happy Guests' },
              { icon: '⭐', value: '4.9', label: 'Guest Rating' },
              { icon: '🏆', value: '18+', label: 'Years of Service' },
            ].map(s => (
              <div key={s.label} style={{ background: LIGHT, borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #d4e4c4' }}>
                <span style={{ fontSize: '22px' }}>{s.icon}</span>
                <div>
                  <div style={{ fontWeight: '800', fontSize: '18px', color: GREEN, fontFamily: 'Georgia, serif' }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PHOTO STRIP */}
      <div className="section-container responsive-grid-3" style={{ margin: '0 auto 80px', gap: '16px' }}>
        {[photos.pool, photos.spa, photos.dining].map((src, i) => (
          <div key={i} style={{ borderRadius: '16px', overflow: 'hidden', height: '200px' }}>
            <img src={src} alt="Resort" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }}
              onMouseEnter={e => e.target.style.transform = 'scale(1.06)'}
              onMouseLeave={e => e.target.style.transform = 'scale(1)'} />
          </div>
        ))}
      </div>

      {/* TIMELINE */}
      <div style={{ background: '#f8f9fa', padding: '80px 0' }}>
        <div className="section-container" style={{ margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <div style={{ fontSize: '11px', color: GOLD, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>Our Journey</div>
            <h2 style={{ fontSize: '34px', fontWeight: '700', color: '#111', fontFamily: 'Georgia, serif', marginBottom: '10px' }}>A Legacy of Growth</h2>
            <p style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>Two decades of unforgettable experiences in Bulacan</p>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Center line */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: '#e5e7eb', transform: 'translateX(-50%)' }} />

            {timeline.map((item, i) => (
              <div key={i} className="timeline-item" style={{ marginBottom: '48px' }}>
                {i % 2 === 0 ? (
                  <>
                    {/* Left card */}
                    <div style={{ paddingRight: '36px', textAlign: 'right' }}>
                      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px 22px', border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'left' }}>
                        <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{item.sub}</div>
                        <div style={{ fontWeight: '700', fontSize: '15px', color: '#111', marginBottom: '8px' }}>{item.title}</div>
                        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.8', margin: 0 }}>{item.desc}</p>
                      </div>
                    </div>
                    {/* Center dot */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: DARK, border: `3px solid ${GREEN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', position: 'relative', zIndex: 1 }}>
                        {item.icon}
                      </div>
                      <div style={{ background: GREEN, borderRadius: '6px', padding: '3px 10px', fontSize: '10px', fontWeight: '700', color: '#fff' }}>{item.year}</div>
                    </div>
                    <div />
                  </>
                ) : (
                  <>
                    <div />
                    {/* Center dot */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: DARK, border: `3px solid ${GREEN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', position: 'relative', zIndex: 1 }}>
                        {item.icon}
                      </div>
                      <div style={{ background: GREEN, borderRadius: '6px', padding: '3px 10px', fontSize: '10px', fontWeight: '700', color: '#fff' }}>{item.year}</div>
                    </div>
                    {/* Right card */}
                    <div style={{ paddingLeft: '36px' }}>
                      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px 22px', border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{item.sub}</div>
                        <div style={{ fontWeight: '700', fontSize: '15px', color: '#111', marginBottom: '8px' }}>{item.title}</div>
                        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.8', margin: 0 }}>{item.desc}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* VALUES */}
      <div className="section-container" style={{ margin: '80px auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '44px' }}>
          <div style={{ fontSize: '11px', color: GOLD, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>Our Values</div>
          <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#111', fontFamily: 'Georgia, serif' }}>What We Stand For</h2>
        </div>
        <div className="responsive-grid-3" style={{ gap: '20px' }}>
          {[
            { icon: '🤝', title: 'Genuine Hospitality', desc: 'We treat every guest like family, ensuring a warm and personalized experience from check-in to check-out.' },
            { icon: '🌿', title: 'Love for Nature', desc: 'Our resort is built in harmony with bamboo gardens, preserving the natural beauty that surrounds us.' },
            { icon: '✨', title: 'Excellence in Service', desc: 'We are committed to delivering world-class service and continuously exceeding our guests\' expectations.' },
          ].map(v => (
            <div key={v.title} style={{ background: LIGHT, borderRadius: '18px', padding: '30px 24px', textAlign: 'center', border: '1px solid #d4e4c4' }}
              onMouseEnter={e => e.currentTarget.style.background = '#e4f0d8'}
              onMouseLeave={e => e.currentTarget.style.background = LIGHT}>
              <div style={{ width: '60px', height: '60px', background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px', border: `2px solid #d4e4c4` }}>
                {v.icon}
              </div>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#111', marginBottom: '10px' }}>{v.title}</div>
              <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.8', margin: 0 }}>{v.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${LIGHT_GREEN})`, padding: '72px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: '-60px', left: '-40px', width: '240px', height: '240px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '11px', color: GOLD, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '14px' }}>Come Experience It</div>
          <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '12px', fontFamily: 'Georgia, serif' }}>
            Ready to Make Memories<br />at Lawiswis Kawayan?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', marginBottom: '30px' }}>
            Join thousands of happy guests who have found peace, nature, and joy at our bamboo garden resort.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={() => window.location.href = '/rooms'}
              style={{ background: '#fff', color: GREEN, border: 'none', borderRadius: '30px', padding: '14px 36px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              Browse Rooms
            </button>
            <button onClick={() => window.location.href = '/contact'}
              style={{ background: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '30px', padding: '14px 36px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              Contact Us
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: '#0d1a0d', color: '#9ca3af', padding: '30px 20px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>© 2026 Lawiswis Kawayan Garden Resort. All rights reserved.</span>
          <span>Made with 🎋 in Bulacan</span>
        </div>
      </footer>
    </div>
  );
}