import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { IMAGE_WIDTHS, optimizeImage } from '../../lib/imageUrl';
import { safeHttpUrl } from '../../lib/safeUrl';
import { openBookingTypeModal } from '../lib/bookingTypeModal';
import { BRASS, CREAM, FOREST, INK, LINE, MOSS, PAPER, RESORT_IMAGES, SERIF, SANS } from '../components/clientTheme';

// One news article from News Management, laid out like the resort
// website's article pages: date, title, full story, related articles and
// a "Book your stay" box.
const longDate = key => {
  if (!key) return '';
  const date = new Date(`${String(key).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
};
// The body is plain text; a blank line starts a new paragraph.
const paragraphs = text => String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const coverOf = (article, width) => (safeHttpUrl(article.imageUrl) ? optimizeImage(article.imageUrl, width) : RESORT_IMAGES.garden);

export default function NewsArticle() {
  const { articleId } = useParams();
  const [article, setArticle] = useState(null);
  const [related, setRelated] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'news', articleId));
        if (!alive) return;
        if (!snap.exists() || snap.data().status !== 'published') { setState('missing'); return; }
        setArticle({ id: snap.id, ...snap.data() });
        setState('ready');
        const others = await getDocs(query(collection(db, 'news'), where('status', '==', 'published'), limit(10)));
        if (!alive) return;
        setRelated(others.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(a => a.id !== snap.id)
          .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
          .slice(0, 3));
      } catch (error) {
        // A draft or deleted article can't be read by guests.
        if (alive) setState('missing');
      }
    })();
    return () => { alive = false; };
  }, [articleId]);

  useEffect(() => {
    if (article?.title) document.title = `${article.title} - Lawiswis Kawayan Garden Resort`;
  }, [article]);

  if (state === 'loading') {
    return <div role="status" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: PAPER, color: '#6b6a5c', font: `13px ${SANS}` }}>Loading article…</div>;
  }
  if (state === 'missing') {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: PAPER, padding: '60px 24px', textAlign: 'center' }}>
        <div>
          <h1 style={{ color: INK, font: `500 30px/1.2 ${SERIF}`, margin: '0 0 10px' }}>Article not found</h1>
          <p style={{ color: '#6b6a5c', font: `13px/1.7 ${SANS}`, margin: '0 0 20px' }}>This story may have been moved or is no longer available.</p>
          <Link to="/home#news" style={{ color: FOREST, font: `600 12px ${SANS}`, letterSpacing: '.06em' }}>← BACK TO NEWS</Link>
        </div>
      </div>
    );
  }

  const body = paragraphs(article.content);
  const story = body.length ? body : paragraphs(article.excerpt);
  const source = safeHttpUrl(article.externalLink);
  const date = longDate(article.publishedAt);

  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      {/* Banner */}
      <section style={{ minHeight: '360px', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '80px 24px 48px', overflow: 'hidden' }}>
        <img src={coverOf(article, IMAGE_WIDTHS.hero)} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,25,15,.25), rgba(20,25,15,.82))' }} />
        <div style={{ position: 'relative', maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <span style={{ background: CREAM, color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: '3px' }}>{article.category || 'News'}</span>
            {date && <span style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>{date}</span>}
          </div>
          <h1 style={{ color: '#fff', font: `500 clamp(30px, 5vw, 52px)/1.12 ${SERIF}`, margin: 0, maxWidth: '860px' }}>{article.title}</h1>
        </div>
      </section>

      <div className="news-article-layout" style={{ maxWidth: '1100px', width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: '56px 24px 90px' }}>
        {/* Story */}
        <article style={{ minWidth: 0 }}>
          <Link to="/home#news" style={{ display: 'inline-block', color: MOSS, font: `600 11px ${SANS}`, letterSpacing: '.1em', textDecoration: 'none', marginBottom: '22px' }}>← ALL NEWS</Link>
          {safeHttpUrl(article.imageUrl) && (
            <img src={coverOf(article, IMAGE_WIDTHS.large)} alt={article.title} style={{ display: 'block', width: '100%', maxHeight: '440px', objectFit: 'cover', borderRadius: '6px', marginBottom: '28px' }} />
          )}
          {story.length ? story.map((text, i) => (
            <p key={i} style={{ color: '#3f4236', font: `15px/1.9 ${SANS}`, margin: '0 0 20px', whiteSpace: 'pre-line' }}>{text}</p>
          )) : (
            <p style={{ color: '#6b6a5c', font: `14px/1.8 ${SANS}` }}>The full story will be posted soon.</p>
          )}
          {source && (
            <a href={source} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '6px', color: INK, font: `600 11px ${SANS}`, letterSpacing: '.08em', textDecorationColor: BRASS, textUnderlineOffset: '4px' }}>
              READ ON THE RESORT WEBSITE →
            </a>
          )}
        </article>

        {/* Sidebar */}
        <aside style={{ display: 'grid', gap: '22px', alignContent: 'start', minWidth: 0 }}>
          {related.length > 0 && (
            <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: '6px', padding: '22px' }}>
              <h2 style={{ color: INK, font: `500 20px/1.2 ${SERIF}`, margin: '0 0 14px' }}>Related Articles</h2>
              <div style={{ display: 'grid', gap: '14px' }}>
                {related.map(item => (
                  <Link key={item.id} to={`/news/${item.id}`} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: '12px', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
                    <img src={coverOf(item, IMAGE_WIDTHS.card)} alt="" loading="lazy" style={{ width: '72px', height: '56px', objectFit: 'cover', borderRadius: '4px' }} />
                    <span>
                      <span style={{ display: 'block', color: INK, font: `500 13.5px/1.35 ${SERIF}` }}>{item.title}</span>
                      {longDate(item.publishedAt) && <span style={{ display: 'block', color: '#8b8977', font: `11px ${SANS}`, marginTop: '3px' }}>{longDate(item.publishedAt)}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section style={{ background: FOREST, color: '#fff', borderRadius: '6px', padding: '24px' }}>
            <div style={{ color: '#c9c19a', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '10px' }}>Book your stay</div>
            <h2 style={{ font: `500 22px/1.25 ${SERIF}`, margin: '0 0 16px' }}>Plan your visit to Lawiswis Kawayan</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <div style={{ font: `600 13px ${SANS}` }}>Personal booking</div>
                <p style={{ color: 'rgba(255,255,255,.75)', font: `12px/1.6 ${SANS}`, margin: '3px 0 0' }}>Less than 15 guests: family gatherings and small celebrations.</p>
              </div>
              <div>
                <div style={{ font: `600 13px ${SANS}` }}>Corporate / big group booking</div>
                <p style={{ color: 'rgba(255,255,255,.75)', font: `12px/1.6 ${SANS}`, margin: '3px 0 0' }}>15 guests or more: team building, seminars and company retreats.</p>
              </div>
            </div>
            <button type="button" onClick={openBookingTypeModal} style={{ marginTop: '18px', width: '100%', background: BRASS, color: '#fff', border: 0, borderRadius: '3px', padding: '13px 18px', font: `600 12px ${SANS}`, letterSpacing: '.05em', cursor: 'pointer' }}>
              BOOK YOUR STAY →
            </button>
          </section>
        </aside>
      </div>
      <style>{`.news-article-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:44px}@media(max-width:860px){.news-article-layout{grid-template-columns:minmax(0,1fr)}}`}</style>
    </div>
  );
}
