import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Building2, Users } from 'lucide-react';
import { AMENITY_GROUPS, AMENITY_STATS } from '../lib/amenities';
import { SERIF, SANS } from '../components/clientTheme';

const PHOTOS = `${process.env.PUBLIC_URL || ''}/images/resort`;

// Bento layout on large screens (6 columns): which column span each group gets.
const SPANS = {
  pools: 'lg:col-span-4',
  events: 'lg:col-span-2',
  dining: 'lg:col-span-2',
  spa: 'lg:col-span-4',
  activities: 'lg:col-span-3',
  stays: 'lg:col-span-3',
  grounds: 'lg:col-span-6',
};

const ACTIVITIES = [
  'Bonfire & s’mores', 'Al fresco movies', 'Kadang-kadang (bamboo stilts)', 'Romantic dinner setup', 'KTV', 'Billiards',
  'Table tennis', 'Street basketball', 'Trampoline', 'Team building', 'Photoshoots in the gardens', 'Grilling & samgyupsal',
];

function Reveal({ children, delay = 0, className = '' }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function AmenityCard({ group, index }) {
  const Icon = group.icon;
  const wide = group.id === 'grounds';
  return (
    <Reveal delay={(index % 3) * 0.08} className={`${SPANS[group.id] || 'lg:col-span-3'} md:col-span-1`}>
      <article id={`amenity-${group.id}`} className={`group h-full scroll-mt-28 overflow-hidden rounded-[28px] border border-[#e3ddc8] bg-white shadow-[0_10px_40px_rgba(35,42,27,0.06)] ${wide ? 'lg:grid lg:grid-cols-2' : 'flex flex-col'}`}>
        <div className={`relative overflow-hidden ${wide ? 'h-64 lg:h-full' : 'h-56'}`}>
          <img src={group.image} alt={group.alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
            <h3 className="text-2xl text-white" style={{ fontFamily: SERIF }}>{group.title}</h3>
            <span className="rounded-full bg-white/20 px-3 py-1 font-mono text-[11px] text-white backdrop-blur-sm">{group.number}</span>
          </div>
        </div>
        <div className={`flex flex-1 flex-col p-6 bg-gradient-to-br ${group.gradient}`}>
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/80"><Icon className="h-5 w-5 text-[#22261B]" aria-hidden="true" /></span>
            <p className="m-0 text-sm leading-relaxed text-[#22261B]/80" style={{ fontFamily: SANS }}>{group.description}</p>
          </div>
          <ul className={`m-0 mt-2 grid list-none gap-x-6 gap-y-2 p-0 ${wide || SPANS[group.id] === 'lg:col-span-4' ? 'sm:grid-cols-2' : ''}`}>
            {group.items.map(item => (
              <li key={item} className="flex items-baseline gap-2 text-[13px] leading-6 text-[#3b3e33]" style={{ fontFamily: SANS }}>
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#B8893B]" />{item}
              </li>
            ))}
          </ul>
        </div>
      </article>
    </Reveal>
  );
}

export default function Amenities() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const float = (delay) => (reduce ? {} : { animate: { y: [0, -8, 0] }, transition: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay } });

  return (
    <div className="min-h-screen bg-[#F7F4EA]">
      {/* Hero: words on the left, a floating photo collage on the right. */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 lg:grid-cols-2 lg:pt-20">
        <Reveal>
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7A4F]" style={{ fontFamily: SANS }}>Our amenities</div>
          <h1 className="m-0 mb-5 text-[clamp(30px,7.5vw,64px)] leading-[1.08] text-[#22261B]" style={{ fontFamily: SERIF }}>
            Unwind and explore — something for everyone.
          </h1>
          <p className="m-0 mb-8 max-w-lg text-[14px] leading-7 text-[#5c5a4c] md:text-[15px] md:leading-8" style={{ fontFamily: SANS }}>
            Whether it’s a thrilling team activity, a relaxing evening with friends, or a romantic escape, Lawiswis Kawayan Garden Resort &amp; Spa brings relaxation, fun and unique experiences together in one bamboo garden.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => navigate('/rooms')} className="inline-flex items-center gap-2 rounded-full bg-[#2F4A35] px-6 py-3 text-xs font-semibold tracking-[0.1em] text-white transition hover:bg-[#3F6B45]" style={{ fontFamily: SANS }}>
              BOOK YOUR STAY <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <a href="#amenity-pools" className="inline-flex items-center rounded-full border border-[#2F4A35] px-6 py-3 text-xs font-semibold tracking-[0.1em] text-[#2F4A35] no-underline transition hover:bg-[#2F4A35]/5" style={{ fontFamily: SANS }}>
              EXPLORE THE GROUNDS
            </a>
          </div>
        </Reveal>

        <div className="relative h-[380px] sm:h-[440px]" aria-hidden="true">
          <motion.img {...float(0)} src={`${PHOTOS}/serenity-pool.jpg`} alt="" className="absolute left-0 top-6 h-[62%] w-[62%] rounded-[28px] object-cover shadow-2xl" />
          <motion.img {...float(1.5)} src={`${PHOTOS}/lanterns-sunset.jpg`} alt="" className="absolute right-0 top-0 h-[44%] w-[48%] rounded-[24px] object-cover shadow-xl" />
          <motion.img {...float(3)} src={`${PHOTOS}/bamboo-cabanas.jpg`} alt="" className="absolute bottom-0 right-6 h-[50%] w-[56%] rounded-[28px] border-4 border-[#F7F4EA] object-cover shadow-2xl" />
        </div>
      </section>

      {/* At a glance */}
      <section className="px-6">
        <Reveal className="mx-auto grid max-w-6xl grid-cols-2 gap-6 rounded-[28px] bg-[#1F3325] px-8 py-8 text-center sm:grid-cols-3 lg:grid-cols-5">
          {AMENITY_STATS.map(stat => (
            <div key={stat.label}>
              <div className="text-3xl text-[#F1E2B3] md:text-4xl" style={{ fontFamily: SERIF }}>{stat.value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/65" style={{ fontFamily: SANS }}>{stat.label}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* Jump to a category */}
      <nav aria-label="Amenity categories" className="mx-auto mt-14 flex max-w-6xl flex-wrap gap-2 px-6">
        {AMENITY_GROUPS.map(group => {
          const Icon = group.icon;
          return (
            <a key={group.id} href={`#amenity-${group.id}`} className="inline-flex items-center gap-2 rounded-full border border-[#e3ddc8] bg-white px-4 py-2 text-xs font-medium text-[#22261B] no-underline transition hover:border-[#B8893B] hover:bg-[#fffaf0]" style={{ fontFamily: SANS }}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {group.title}
            </a>
          );
        })}
      </nav>

      {/* Bento grid of every amenity group */}
      <section className="mx-auto mt-8 grid max-w-6xl gap-6 px-6 md:grid-cols-2 lg:grid-cols-6">
        {AMENITY_GROUPS.map((group, index) => <AmenityCard key={group.id} group={group} index={index} />)}
      </section>

      {/* Activities */}
      <section className="mx-auto mt-20 max-w-6xl px-6">
        <Reveal>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7A4F]" style={{ fontFamily: SANS }}>Things to do</div>
          <h2 className="m-0 mb-6 text-[clamp(28px,4vw,40px)] text-[#22261B]" style={{ fontFamily: SERIF }}>Activities at Lawiswis Kawayan</h2>
          <div className="flex flex-wrap gap-3">
            {ACTIVITIES.map((activity, index) => (
              <motion.span
                key={activity}
                initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
                className="rounded-full bg-[#E8EFDF] px-5 py-2.5 text-sm text-[#2F4A35]"
                style={{ fontFamily: SANS }}
              >
                {activity}
              </motion.span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Book your stay: personal or group */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-20">
        <Reveal className="grid gap-6 md:grid-cols-2">
          {[
            { icon: Users, title: 'Personal Booking', tag: 'Less than 15 guests', text: 'For overnight stays, family gatherings, day tours and intimate small celebrations.', action: 'Book a room', to: '/rooms', dark: true },
            { icon: Building2, title: 'Corporate / Big Group Booking', tag: '15 to 250 guests', text: 'For team building, seminars and company retreats, with function spaces and group packages. Book at least 1 week ahead.', action: 'Plan a group booking', to: '/corporate-booking', dark: false },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.title} className={`flex flex-col rounded-[28px] p-8 ${card.dark ? 'bg-[#1F3325] text-white' : 'border border-[#e3ddc8] bg-white text-[#22261B]'}`}>
                <Icon className={`mb-5 h-8 w-8 ${card.dark ? 'text-[#F1E2B3]' : 'text-[#2F4A35]'}`} aria-hidden="true" />
                <div className={`mb-2 text-[11px] uppercase tracking-[0.14em] ${card.dark ? 'text-white/60' : 'text-[#6B7A4F]'}`} style={{ fontFamily: SANS }}>{card.tag}</div>
                <h3 className="m-0 mb-3 text-2xl" style={{ fontFamily: SERIF }}>{card.title}</h3>
                <p className={`m-0 mb-6 text-sm leading-7 ${card.dark ? 'text-white/75' : 'text-[#5c5a4c]'}`} style={{ fontFamily: SANS }}>{card.text}</p>
                <button type="button" onClick={() => navigate(card.to)}
                  className={`mt-auto inline-flex w-fit items-center gap-2 rounded-full px-6 py-3 text-xs font-semibold tracking-[0.1em] transition ${card.dark ? 'bg-[#F1E2B3] text-[#1F3325] hover:bg-white' : 'bg-[#2F4A35] text-white hover:bg-[#3F6B45]'}`}
                  style={{ fontFamily: SANS }}>
                  {card.action.toUpperCase()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </Reveal>
        <p className="mt-8 text-center text-xs text-[#8b8977]" style={{ fontFamily: SANS }}>
          For availability, operating hours or group activity arrangements, please contact our team before your visit.
        </p>
      </section>
    </div>
  );
}
