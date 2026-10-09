import React from 'react';
import { BRASS, CREAM, FOREST, INK, LINE, MOSS, PAPER, RESORT_IMAGES, SERIF, SANS } from '../components/clientTheme';

const values = [
  ['01', 'Genuine hospitality', 'Every guest is welcomed with the warmth and care we would offer family.'],
  ['02', 'A love for nature', 'Our bamboo gardens are not decoration. They are the rhythm of the place.'],
  ['03', 'Room to reconnect', 'From quiet weekends to big reunions, every stay should leave space for memory.'],
];

const journey = [
  {
    year: '2005',
    title: 'Foundation and beginnings',
    description: 'Clearing operations began, along with work on the property fence, driveway, pond, kitchen, and pavilion.',
    image: RESORT_IMAGES.garden,
    imageAlt: 'Garden grounds at Lawiswis Kawayan Garden Resort',
  },
  {
    year: '2006',
    title: 'Building relaxation',
    description: 'The adult and kiddie swimming pools and bamboo poolside cabanas were built.',
    image: RESORT_IMAGES.pool,
    imageAlt: 'Swimming pool at Lawiswis Kawayan Garden Resort',
  },
  {
    year: 'February 6, 2006',
    title: 'Official incorporation',
    description: 'Lawiswis Kawayan Resort Corp. was officially incorporated.',
  },
  {
    year: 'March 4, 2006',
    title: 'Our soft opening',
    description: 'After a blessing ceremony, the resort welcomed its first guests.',
    image: RESORT_IMAGES.hero,
    imageAlt: 'Lawiswis Kawayan Garden Resort',
  },
  {
    year: '2007',
    title: 'The Main Villa',
    description: 'The resort built its Main Villa.',
  },
  {
    year: '2008',
    title: 'A spa milestone',
    description: 'Lawiswis Kawayan Spa opened as a new place for guests to relax and rejuvenate.',
    image: RESORT_IMAGES.spa,
    imageAlt: 'Spa at Lawiswis Kawayan Garden Resort',
  },
  {
    year: '2012',
    title: 'First guest-room building',
    description: 'The first guest-room building was constructed with 11 rooms and a private house on the third floor.',
  },
  {
    year: '2018',
    title: 'Function and dining halls',
    description: 'The resort opened function and dining halls for events, celebrations, and gatherings.',
    image: RESORT_IMAGES.dining,
    imageAlt: 'Dining space at Lawiswis Kawayan Garden Resort',
  },
  {
    year: '2021',
    title: 'Couples’ and family suites',
    description: 'A new building added 12 couples’ and family suites.',
    image: RESORT_IMAGES.garden,
    imageAlt: 'Resort grounds at Lawiswis Kawayan Garden Resort',
  },
  {
    year: '2023',
    title: 'Bubble pool',
    description: 'The resort introduced its bubble pool.',
  },
  {
    year: '2024',
    title: 'Reception and coffee shop plans',
    description: 'The resort announced plans for a new reception area and coffee shop.',
  },
];

export default function About() {
  return <div style={{ background: PAPER }}>
    <section style={{ minHeight: '540px', position: 'relative', display: 'flex', alignItems: 'end', padding: '70px 24px', overflow: 'hidden' }}><img src={RESORT_IMAGES.hero} alt="Lawiswis Kawayan garden" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(20,25,15,.75), rgba(20,25,15,.15))' }} /><div style={{ position: 'relative', maxWidth: '1100px', width: '100%', margin: '0 auto' }}><div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Our story · Since 2006</div><h1 style={{ color: '#fff', font: `500 clamp(44px, 7vw, 78px)/1 ${SERIF}`, margin: '0 0 18px', maxWidth: '700px' }}>A garden shaped by love, memory, and bamboo.</h1><p style={{ color: 'rgba(255,255,255,.8)', font: `14px/1.8 ${SANS}`, maxWidth: '500px', margin: 0 }}>Lawiswis Kawayan is a peaceful hideaway in Calumpit, Bulacan, where the day slows down naturally.</p></div></section>
    <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '100px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '70px', alignItems: 'center' }}><img src={RESORT_IMAGES.garden} alt="Resort villa" style={{ width: '100%', height: '450px', objectFit: 'cover' }} /><div><div style={{ color: MOSS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>The meaning of Lawiswis Kawayan</div><h2 style={{ color: INK, font: `500 40px/1.15 ${SERIF}`, margin: '0 0 20px' }}>A quiet place to return to yourself.</h2><p style={{ color: '#5c5a4c', font: `14px/1.9 ${SANS}`, marginBottom: '16px' }}>The resort’s name was inspired by a beloved Filipino song that founder Atty. Federico Aranas taught his children. Its story of a couple meeting beneath the Lawiswis Kawayan reflects the resort’s vision: a peaceful place, surrounded by bamboo, where people can come together and make memories.</p><p style={{ color: '#5c5a4c', font: `14px/1.9 ${SANS}`, margin: 0 }}>The resort began in 2005 and was officially incorporated in 2006. Families, couples, and groups have since found their own version of rest here. The garden keeps growing, but the welcome stays the same.</p></div></section>
    <section className="about-journey-section" style={{ background: '#fff', padding: '84px 24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div className="about-journey-heading">
          <div>
            <div style={{ color: MOSS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '12px' }}>A legacy of growth and unforgettable experiences</div>
            <h2 style={{ color: INK, font: `500 clamp(34px, 5vw, 46px) ${SERIF}`, margin: 0 }}>Our Journey</h2>
          </div>
          <p style={{ color: '#5c5a4c', font: `14px/1.9 ${SANS}`, margin: 0 }}>
            From humble beginnings in 2005 to new amenities in 2024, Lawiswis Kawayan Resort has grown into a tranquil oasis, blending nature, tradition, and modern comfort.
          </p>
        </div>
        <div className="about-journey-timeline">
          {journey.map((milestone, index) => (
            <article key={milestone.year} className="about-journey-item">
              <div className="about-journey-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
              <div className="about-journey-copy">
                <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '8px' }}>{milestone.year}</div>
                <h3 style={{ color: INK, font: `500 23px ${SERIF}`, margin: '0 0 9px' }}>{milestone.title}</h3>
                <p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}`, margin: 0 }}>{milestone.description}</p>
              </div>
              {milestone.image && <img src={milestone.image} alt={milestone.imageAlt} loading="lazy" className="about-journey-image" />}
            </article>
          ))}
        </div>
      </div>
    </section>
    <section style={{ background: CREAM, padding: '90px 24px' }}><div style={{ maxWidth: '1100px', margin: '0 auto' }}><div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '12px' }}>What guides us</div><h2 style={{ color: INK, font: `500 40px ${SERIF}`, margin: '0 0 40px' }}>A stay with substance.</h2><div className="about-values-grid">{values.map(value => <div key={value[0]} style={{ background: CREAM, padding: '30px 26px', minHeight: '180px' }}><div style={{ color: BRASS, font: `500 24px ${SERIF}`, marginBottom: '22px' }}>{value[0]}</div><h3 style={{ color: INK, font: `600 18px ${SERIF}`, margin: '0 0 10px' }}>{value[1]}</h3><p style={{ color: '#6b6a5c', font: `12px/1.8 ${SANS}`, margin: 0 }}>{value[2]}</p></div>)}</div></div></section>
    <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '100px 24px' }}><div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: '18px' }}><img src={RESORT_IMAGES.pool} alt="Resort pool" style={{ width: '100%', height: '300px', objectFit: 'cover' }} /><img src={RESORT_IMAGES.dining} alt="Resort dining" style={{ width: '100%', height: '300px', objectFit: 'cover' }} /></div><div style={{ marginTop: '46px', display: 'flex', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}><div><div style={{ color: MOSS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase' }}>Come find your pace</div><h2 style={{ color: INK, font: `500 34px ${SERIF}`, margin: '10px 0 0' }}>Your next quiet morning is waiting.</h2></div><button onClick={() => { window.location.href = '/rooms'; }} style={{ background: FOREST, color: '#fff', border: 0, borderRadius: '3px', padding: '14px 24px', font: `600 11px ${SANS}`, letterSpacing: '.06em', cursor: 'pointer' }}>BROWSE ROOMS →</button></div></section>
    <style>{`
      .about-journey-heading{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:end;border-bottom:1px solid ${LINE};padding-bottom:28px}
      .about-journey-timeline{display:grid;gap:0;margin-top:12px}
      .about-journey-item{display:grid;grid-template-columns:54px minmax(0,1fr) minmax(260px,.9fr);gap:22px;align-items:center;padding:30px 0;border-bottom:1px solid ${LINE}}
      .about-journey-marker{width:42px;height:42px;border:1px solid ${LINE};border-radius:50%;display:grid;place-items:center;color:${BRASS};font:600 10px ${SANS}}
      .about-journey-image{display:block;width:100%;height:190px;object-fit:cover}
      .about-values-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:${LINE}}
      .about-values-grid>div{min-width:0}
      @media(max-width:700px){.about-journey-heading,.about-journey-item,.about-values-grid{grid-template-columns:1fr;gap:16px}.about-journey-marker{width:36px;height:36px}.about-journey-image{height:220px}}
    `}</style>
  </div>;
}