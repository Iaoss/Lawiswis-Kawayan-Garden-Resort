import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const HERO_IMAGE =
  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/09/About-Lawiswis-Kawayan-scaled-1.jpeg';

const RESORT = 'Lawiswis Kawayan';
const TAGLINE = 'Garden Resort · Guest feedback';

/* ---------------------------------- icons --------------------------------- */
const Ico = ({ children, size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);
const IUser = (p) => <Ico {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Ico>;
const IMail = (p) => <Ico {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></Ico>;
const IKey = (p) => <Ico {...p}><path d="M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /></Ico>;
const IMsg = (p) => <Ico {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Ico>;
const ILeaf = (p) => <Ico {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z" /><path d="M2 21c0-3 1.9-5.4 5.1-6" /></Ico>;
const IBed = (p) => <Ico {...p}><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" /><path d="M2 16h20M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" /></Ico>;
const IStaff = (p) => <Ico {...p}><circle cx="12" cy="7" r="3" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /><path d="M3 12h2M19 12h2" /></Ico>;
const IPool = (p) => <Ico {...p}><path d="M2 17c2 0 2 1.5 4 1.5S8 17 10 17s2 1.5 4 1.5S16 17 18 17s2 1.5 4 1.5" /><path d="M7 15V5a2 2 0 0 1 4 0M13 15V5a2 2 0 0 1 4 0" /><path d="M7 9h10" /></Ico>;
const ISend = (p) => <Ico {...p}><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></Ico>;
const ICheck = (p) => <Ico {...p}><path d="M20 6 9 17l-5-5" /></Ico>;
const ILock = (p) => <Ico {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Ico>;
const StarShape = ({ size = 26, filled }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />
  </svg>
);

const CATEGORIES = [
  { key: 'ambience',  label: 'Garden & ambience',   Icon: ILeaf },
  { key: 'rooms',     label: 'Rooms & cleanliness', Icon: IBed },
  { key: 'staff',     label: 'Staff service',       Icon: IStaff },
  { key: 'facilities',label: 'Pool & facilities',   Icon: IPool },
];
const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/* ------------------------------- component -------------------------------- */
export default function FeedbackForm() {
  const [guest, setGuest] = useState({ guestName: '', email: '', roomNumber: '', comment: '' });
  const [scores, setScores] = useState({ ambience: 0, rooms: 0, staff: 0, facilities: 0 });
  const [hover, setHover] = useState({ key: null, value: 0 });
  const [tags, setTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    if (document.getElementById('hp-fonts')) return;
    const l = document.createElement('link');
    l.id = 'hp-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);

  const given = Object.values(scores).filter(Boolean);
  const overall = given.length ? given.reduce((a, b) => a + b, 0) / given.length : 0;
  const overallRounded = Math.round(overall);
  const complete = given.length === CATEGORIES.length;

  const TAGS = ['Clean rooms', 'Friendly staff', 'Great food', 'Beautiful pool',
    'Good value', 'Peaceful', 'Check-in was slow', 'Needs improvement'];
  const toggleTag = (t) => setTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const submit = async (e) => {
    e.preventDefault();
    if (!given.length) { setError('Rate at least one category before you send.'); return; }
    setError(''); setSubmitting(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        guestName: guest.guestName.trim(),
        email: guest.email.trim(),
        roomNumber: guest.roomNumber.trim(),
        comment: guest.comment.trim(),
        rating: overallRounded,          // admin portal reads this
        ratings: scores,                 // per-category breakdown
        tags,
        read: false,
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(
        err?.code === 'permission-denied'
          ? 'Firestore rejected the write (permission-denied). Your security rules need to allow create on the feedback collection.'
          : `Could not send your feedback. ${err?.code || err?.message || 'Please try again.'}`
      );
    }
    setSubmitting(false);
  };

  /* ------------------------------ thank you ------------------------------- */
  if (submitted) return (
    <div className="lk" style={{ display: 'grid', placeItems: 'center', padding: '24px' }}>
      <Styles />
      <div className="lk-card lk-thanks">
        <div className="lk-ring">
          <svg viewBox="0 0 52 52" width="58" height="58" aria-hidden="true">
            <circle className="lk-ring-c" cx="26" cy="26" r="23" fill="none" strokeWidth="2.5" />
            <path className="lk-ring-k" fill="none" strokeWidth="3.4" strokeLinecap="round"
              strokeLinejoin="round" d="M15 27l8 8 15-16" />
          </svg>
        </div>
        <h2>Feedback sent</h2>
        <p>Thank you. This goes straight to the {RESORT} management team, and anything you
          rated two stars or below gets looked at today.</p>
        <div className="lk-score">
          <div className="lk-score-num">{overall.toFixed(1)}<span>/5</span></div>
          <div className="lk-score-stars">
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} className={s <= overallRounded ? 'on' : 'off'}><StarShape size={18} filled={s <= overallRounded} /></span>
            ))}
          </div>
          <div className="lk-score-word">{WORDS[overallRounded]}</div>
        </div>
        <button className="lk-submit" onClick={() => (window.location.href = '/home')}>Back to home</button>
      </div>
    </div>
  );

  /* --------------------------------- form --------------------------------- */
  return (
    <div className="lk">
      <Styles />
      <div className="lk-card">

        {/* hero */}
        <header className="lk-hero">
          {imgOk && <img src={HERO_IMAGE} alt="" onError={() => setImgOk(false)} />}
          <div className="lk-hero-veil" />
          <div className="lk-hero-text">
            <h1>{RESORT}</h1>
            <p>{TAGLINE}</p>
          </div>
        </header>

        <form onSubmit={submit} noValidate>

          {/* ratings first — it's the only required part */}
          <section className="lk-sec">
            <h2 className="lk-sec-title"><StarShape size={17} filled /> Rate your experience</h2>
            <div className="lk-rates">
              {CATEGORIES.map(({ key, label, Icon }, i) => {
                const shown = hover.key === key ? hover.value : scores[key];
                return (
                  <div className="lk-rate" key={key} style={{ '--d': `${0.05 * i}s` }}>
                    <span className="lk-rate-label"><Icon size={17} /> {label}</span>
                    <span className="lk-rate-right">
                      <span className="lk-stars" role="group" aria-label={label}
                        onMouseLeave={() => setHover({ key: null, value: 0 })}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <button key={s} type="button"
                            aria-label={`${label}: ${s} star${s > 1 ? 's' : ''}`}
                            aria-pressed={scores[key] === s}
                            className={`lk-star ${shown >= s ? 'on' : ''} ${scores[key] === s ? 'picked' : ''}`}
                            onMouseEnter={() => setHover({ key, value: s })}
                            onFocus={() => setHover({ key, value: s })}
                            onBlur={() => setHover({ key: null, value: 0 })}
                            onClick={() => { setScores({ ...scores, [key]: s }); setError(''); }}>
                            <StarShape size={25} filled={shown >= s} />
                          </button>
                        ))}
                      </span>
                      <span className="lk-rate-word">{WORDS[shown] || ''}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className={`lk-overall ${given.length ? 'live' : ''}`}>
              <div>
                <span className="lk-overall-label">Overall</span>
                <span className="lk-overall-num">{given.length ? overall.toFixed(1) : '—'}<em>/5</em></span>
              </div>
              <div className="lk-meter"><i style={{ width: `${(overall / 5) * 100}%` }} /></div>
              <span className="lk-overall-hint">
                {complete ? WORDS[overallRounded] : `${given.length} of 4 rated`}
              </span>
            </div>
          </section>

          {/* guest info */}
          <section className="lk-sec">
            <h2 className="lk-sec-title"><IUser size={17} /> Guest information</h2>
            <p className="lk-sec-note">Optional — leave blank to stay anonymous.</p>
            <div className="lk-grid">
              <label className="lk-field">
                <span>Full name</span>
                <span className="lk-input"><IUser size={16} />
                  <input value={guest.guestName} autoComplete="name" placeholder="Maria Santos"
                    onChange={e => setGuest({ ...guest, guestName: e.target.value })} /></span>
              </label>
              <label className="lk-field">
                <span>Room number</span>
                <span className="lk-input"><IKey size={16} />
                  <input value={guest.roomNumber} inputMode="numeric" placeholder="101"
                    onChange={e => setGuest({ ...guest, roomNumber: e.target.value })} /></span>
              </label>
            </div>
            <label className="lk-field">
              <span>Email address</span>
              <span className="lk-input"><IMail size={16} />
                <input type="email" value={guest.email} autoComplete="email" placeholder="maria@example.com"
                  onChange={e => setGuest({ ...guest, email: e.target.value })} /></span>
            </label>
          </section>

          {/* comments */}
          <section className="lk-sec">
            <h2 className="lk-sec-title"><IMsg size={17} /> Your experience</h2>
            <div className="lk-chips">
              {TAGS.map(t => (
                <button key={t} type="button" aria-pressed={tags.includes(t)}
                  className={`lk-chip ${tags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>
                  <span className="lk-chip-tick"><ICheck size={13} /></span>{t}
                </button>
              ))}
            </div>
            <label className="lk-field">
              <span className="lk-input lk-input--area">
                <textarea rows={4} maxLength={800} value={guest.comment}
                  placeholder="Tell us what you loved, or how we can improve."
                  onChange={e => setGuest({ ...guest, comment: e.target.value })} />
              </span>
              <span className="lk-count">{guest.comment.length}/800</span>
            </label>
          </section>

          {error && <p className="lk-error" role="alert">{error}</p>}

          <div className="lk-foot">
            <button type="submit" className="lk-submit" disabled={submitting || !given.length}>
              {submitting ? <><i className="lk-spin" />Sending</> : <><ISend size={17} />Submit feedback</>}
            </button>
            <p className="lk-note"><ILock size={13} /> Shared only with {RESORT} management.</p>
          </div>
        </form>
      </div>
    </div>
  );
}

/* --------------------------------- styles --------------------------------- */
function Styles() {
  return (
    <style>{`
.lk{
  --green:#2c5545; --green-d:#1d3b2f; --gold:#e0a53c; --paper:#ffffff;
  --bg:#eceee9; --ink:#1d2b24; --muted:#77857d; --line:#e4e8e4; --field:#f7f9f7;
  --red:#b4402f;
  min-height:100vh; background:var(--bg); padding:26px 18px 48px;
  font-family:'Poppins',system-ui,sans-serif; color:var(--ink);
  display:flex; justify-content:center;
}
.lk *{box-sizing:border-box}
.lk-card{
  width:100%; max-width:720px; background:var(--paper); border-radius:22px; overflow:hidden;
  box-shadow:0 24px 60px -28px rgba(29,59,47,.42); border:1px solid var(--line);
  animation:lk-up .5s cubic-bezier(.2,.75,.3,1) both;
}
@keyframes lk-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}

/* hero */
.lk-hero{position:relative; height:190px; background:var(--green-d); overflow:hidden}
.lk-hero img{position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
  animation:lk-zoom 10s ease-out both}
@keyframes lk-zoom{from{transform:scale(1.12)}to{transform:scale(1)}}
.lk-hero-veil{position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(15,32,25,.15),rgba(15,32,25,.82))}
.lk-hero-text{position:absolute; left:28px; right:28px; bottom:22px; color:#fff}
.lk-hero-text h1{margin:0 0 4px; font-size:30px; font-weight:600; letter-spacing:-.02em; line-height:1.1}
.lk-hero-text p{margin:0; font-size:12.5px; color:rgba(255,255,255,.72)}

/* sections */
.lk-sec{padding:26px 28px; border-bottom:1px solid var(--line)}
.lk-sec-title{display:flex; align-items:center; gap:9px; margin:0 0 4px;
  font-size:15px; font-weight:600; color:var(--green)}
.lk-sec-note{margin:0 0 16px; font-size:12px; color:var(--muted)}
.lk-sec-title + .lk-rates,.lk-sec-title + .lk-grid,.lk-sec-title + .lk-chips{margin-top:16px}

/* ratings */
.lk-rates{background:var(--field); border:1px solid var(--line); border-radius:16px; padding:6px 16px}
.lk-rate{display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:12px 0; border-bottom:1px solid var(--line); animation:lk-up .45s var(--d) both}
.lk-rate:last-child{border-bottom:0}
.lk-rate-label{display:flex; align-items:center; gap:9px; font-size:13px; font-weight:500; color:var(--ink)}
.lk-rate-label svg{color:var(--green)}
.lk-rate-right{display:flex; align-items:center; gap:10px}
.lk-stars{display:flex; gap:2px}
.lk-star{background:none; border:0; padding:2px; cursor:pointer; line-height:0; border-radius:8px;
  color:#cfd6d1; transition:color .16s ease, transform .16s ease}
.lk-star.on{color:var(--gold)}
.lk-star:hover{transform:translateY(-2px)}
.lk-star.picked{animation:lk-pop .32s cubic-bezier(.3,1.5,.5,1)}
.lk-star:focus-visible{outline:2px solid var(--green); outline-offset:2px}
@keyframes lk-pop{0%{transform:scale(1)}45%{transform:scale(1.3) rotate(-8deg)}100%{transform:scale(1)}}
.lk-rate-word{width:64px; font-size:11px; color:var(--muted); text-align:right}

.lk-overall{display:flex; align-items:center; gap:14px; margin-top:16px; padding:14px 16px;
  border-radius:14px; background:var(--green); color:#fff; opacity:.55; transition:opacity .3s ease}
.lk-overall.live{opacity:1}
.lk-overall-label{display:block; font-size:10.5px; color:rgba(255,255,255,.7)}
.lk-overall-num{font-size:22px; font-weight:600; line-height:1.1}
.lk-overall-num em{font-style:normal; font-size:12px; color:rgba(255,255,255,.65)}
.lk-meter{flex:1; height:6px; border-radius:99px; background:rgba(255,255,255,.2); overflow:hidden}
.lk-meter i{display:block; height:100%; border-radius:99px; background:var(--gold);
  transition:width .45s cubic-bezier(.2,.8,.3,1)}
.lk-overall-hint{font-size:11.5px; color:rgba(255,255,255,.8); min-width:62px; text-align:right}

/* fields */
.lk-grid{display:grid; grid-template-columns:1fr 1fr; gap:12px}
.lk-field{display:block; position:relative; margin-bottom:14px}
.lk-field > span:first-child{display:block; font-size:12px; color:var(--muted); margin-bottom:6px}
.lk-input{display:flex; align-items:center; gap:10px; background:var(--field);
  border:1px solid var(--line); border-radius:12px; padding:0 13px;
  transition:border-color .18s ease, box-shadow .18s ease, background .18s ease}
.lk-input svg{color:#9fada5; flex-shrink:0}
.lk-input:focus-within{background:#fff; border-color:var(--green); box-shadow:0 0 0 3px rgba(44,85,69,.12)}
.lk-input input,.lk-input textarea{flex:1; border:0; outline:0; background:none; font-family:inherit;
  font-size:13.5px; color:var(--ink); padding:13px 0; resize:vertical}
.lk-input--area{padding:0 14px}
.lk-input textarea{line-height:1.65; min-height:104px}
.lk-input ::placeholder{color:#a7b2ab}
.lk-count{position:absolute; right:2px; bottom:-16px; font-size:10.5px; color:#a7b2ab}

/* chips */
.lk-chips{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px}
.lk-chip{display:inline-flex; align-items:center; font-family:inherit; font-size:12.5px;
  background:var(--field); color:var(--ink); border:1px solid var(--line); border-radius:99px;
  padding:8px 14px; cursor:pointer; transition:.18s ease}
.lk-chip:hover{border-color:var(--green)}
.lk-chip.on{background:var(--green); border-color:var(--green); color:#fff}
.lk-chip-tick{display:inline-grid; place-items:center; width:0; overflow:hidden;
  transition:width .2s ease, margin .2s ease}
.lk-chip.on .lk-chip-tick{width:13px; margin-right:7px}
.lk-chip:focus-visible{outline:2px solid var(--green); outline-offset:2px}

/* footer */
.lk-foot{padding:24px 28px 28px}
.lk-error{margin:0 28px; padding:12px 14px; border-radius:12px;
  background:#fdecea; color:var(--red); font-size:12.5px; line-height:1.55}
.lk-submit{width:100%; display:flex; align-items:center; justify-content:center; gap:9px;
  background:var(--green); color:#fff; border:0; border-radius:13px; padding:15px;
  font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;
  transition:background .2s ease, transform .15s ease}
.lk-submit:hover:not(:disabled){background:var(--green-d); transform:translateY(-1px)}
.lk-submit:disabled{background:#dfe4e0; color:#a3aea8; cursor:not-allowed}
.lk-submit:focus-visible{outline:2px solid var(--green); outline-offset:3px}
.lk-spin{width:15px; height:15px; border-radius:50%; border:2px solid rgba(255,255,255,.35);
  border-top-color:#fff; animation:lk-rot .7s linear infinite}
@keyframes lk-rot{to{transform:rotate(360deg)}}
.lk-note{display:flex; align-items:center; justify-content:center; gap:6px;
  margin:13px 0 0; font-size:11.5px; color:var(--muted)}

/* thank you */
.lk-thanks{max-width:420px; text-align:center; padding:44px 30px}
.lk-thanks h2{font-size:23px; font-weight:600; color:var(--green); margin:0 0 8px}
.lk-thanks p{font-size:13px; color:var(--muted); line-height:1.7; margin:0 0 22px}
.lk-ring{width:84px; height:84px; margin:0 auto 20px; border-radius:50%;
  background:#e8f1ea; display:grid; place-items:center}
.lk-ring-c{stroke:rgba(44,85,69,.25); stroke-dasharray:145; stroke-dashoffset:145; animation:lk-draw .6s ease-out forwards}
.lk-ring-k{stroke:var(--green); stroke-dasharray:40; stroke-dashoffset:40; animation:lk-draw .4s .45s ease-out forwards}
@keyframes lk-draw{to{stroke-dashoffset:0}}
.lk-score{background:var(--field); border:1px solid var(--line); border-radius:14px; padding:16px; margin-bottom:22px}
.lk-score-num{font-size:26px; font-weight:600; color:var(--ink)}
.lk-score-num span{font-size:13px; color:var(--muted)}
.lk-score-stars{display:flex; justify-content:center; gap:3px; margin:6px 0 4px; color:var(--gold)}
.lk-score-stars .off{color:#cfd6d1}
.lk-score-word{font-size:12.5px; font-weight:500; color:var(--green)}

@media (max-width:640px){
  .lk{padding:0}
  .lk-card{border-radius:0; border:0; min-height:100vh}
  .lk-hero{height:160px}
  .lk-hero-text{left:20px; right:20px; bottom:18px}
  .lk-hero-text h1{font-size:24px}
  .lk-sec,.lk-foot{padding-left:20px; padding-right:20px}
  .lk-error{margin:0 20px}
  .lk-grid{grid-template-columns:1fr}
  .lk-rate{flex-direction:column; align-items:flex-start; gap:8px}
  .lk-rate-right{width:100%; justify-content:space-between}
  .lk-star svg{width:27px; height:27px}
}
@media (prefers-reduced-motion:reduce){.lk *{animation:none!important; transition:none!important}}
`}</style>
  );
}