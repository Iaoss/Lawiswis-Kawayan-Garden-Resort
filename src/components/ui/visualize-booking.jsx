import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Columns3, Grid } from 'lucide-react';

// Month calendar of bookings (based on the "visualize booking" calendar).
// Each day is a rounded tile with a bubble showing how many bookings are on
// it; hovering the day grows the bubble. The side list shows the bookings,
// with the hovered or chosen day moved to the top.
//
// days:       Date[] for the 6-week grid (from monthGrid)
// bookingsOn: { 'YYYY-MM-DD': reservation[] }
// month:      the month shown (Date, first of the month)
// statusColor: { status: color }

const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longDay = d => d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

function Day({ date, list, inMonth, isToday, isChosen, t, onHover, onChoose }) {
  const [hovered, setHovered] = useState(false);
  const key = iso(date);
  const count = list.length;
  return (
    <motion.button
      type="button"
      layout
      onMouseEnter={() => { setHovered(true); onHover(key); }}
      onMouseLeave={() => { setHovered(false); onHover(null); }}
      onFocus={() => onHover(key)}
      onBlur={() => onHover(null)}
      onClick={() => onChoose(key)}
      aria-label={`${longDay(date)}: ${count ? `${count} booking${count === 1 ? '' : 's'}` : 'no bookings'}`}
      aria-pressed={isChosen}
      className="relative flex items-center justify-center"
      style={{
        height: '4.25rem',
        borderRadius: 16,
        border: isChosen ? `2px solid ${t.ACCENT}` : `1px solid ${t.BORDER}`,
        background: inMonth ? t.CARD2 : 'transparent',
        opacity: inMonth ? 1 : 0.45,
        cursor: 'pointer',
        fontFamily: 'inherit',
        padding: 0,
      }}
    >
      <span
        className="text-sm"
        style={{
          fontWeight: isToday ? 800 : 600,
          color: isToday ? t.ACCENT_TEXT : t.TEXT,
          background: isToday ? t.ACCENT : 'transparent',
          borderRadius: 999,
          minWidth: 26,
          height: 26,
          display: 'inline-grid',
          placeItems: 'center',
        }}
      >
        {date.getDate()}
      </span>
      {count > 0 && !hovered && (
        <motion.span
          layoutId={`bubble-${key}`}
          className="absolute bottom-1 right-1 flex items-center justify-center text-[10px] font-bold"
          style={{ width: 20, height: 20, borderRadius: 999, background: t.BUBBLE, color: t.BUBBLE_TEXT }}
        >
          {count}
        </motion.span>
      )}
      <AnimatePresence>
        {count > 0 && hovered && (
          <span className="absolute inset-0 flex items-center justify-center">
            <motion.span
              layoutId={`bubble-${key}`}
              className="flex items-center justify-center text-xs font-bold"
              style={{ width: 40, height: 40, borderRadius: 999, background: t.BUBBLE, color: t.BUBBLE_TEXT }}
            >
              {count}
            </motion.span>
          </span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function BookingCalendar({ days, bookingsOn, month, todayKey, t, statusColor = {}, onSelect, title }) {
  const [showList, setShowList] = useState(true);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [chosenDay, setChosenDay] = useState(null);

  // Days of this month that have bookings, the hovered/chosen one first.
  const listed = useMemo(() => {
    const focus = hoveredDay || chosenDay;
    const inMonth = days.filter(d => d.getMonth() === month.getMonth() && (bookingsOn[iso(d)] || []).length);
    if (!focus) return inMonth;
    return [...inMonth].sort((a, b) => (iso(a) === focus ? -1 : iso(b) === focus ? 1 : 0));
  }, [days, month, bookingsOn, hoveredDay, chosenDay]);

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start">
      <motion.div layout className="w-full" style={{ maxWidth: showList ? 620 : 900, flex: '1 1 0', minWidth: 0 }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          {title === false ? <span style={{ fontSize: 12, color: t.MUTED }}>Point at a day to see how many bookings it has.</span> : (
            <h2 className="text-3xl font-bold tracking-wide" style={{ color: t.TEXT, margin: 0 }}>
              {title || month.toLocaleDateString('en-PH', { month: 'long' })}{' '}
              <span style={{ opacity: 0.5 }}>{month.getFullYear()}</span>
            </h2>
          )}
          <button
            type="button"
            onClick={() => setShowList(value => !value)}
            aria-pressed={showList}
            title={showList ? 'Hide the bookings list' : 'Show the bookings list'}
            className="relative flex items-center gap-3 rounded-lg px-1.5 py-1"
            style={{ border: `1px solid ${t.BORDER}`, color: t.MUTED, background: 'transparent', cursor: 'pointer' }}
          >
            <Grid className="relative z-[2]" size={20} style={{ color: showList ? t.MUTED : t.ACCENT_TEXT }} />
            <Columns3 className="relative z-[2]" size={20} style={{ color: showList ? t.ACCENT_TEXT : t.MUTED }} />
            <span
              aria-hidden="true"
              className="absolute left-0 h-[85%] w-7 rounded-md transition-transform duration-300"
              style={{ top: '50%', background: t.ACCENT, transform: showList ? 'translateY(-50%) translateX(36px)' : 'translateY(-50%) translateX(4px)' }}
            />
          </button>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-2">
          {WEEK.map(day => (
            <div key={day} className="rounded-xl py-1 text-center text-xs font-semibold" style={{ background: t.CARD2, color: t.MUTED, border: `1px solid ${t.BORDER}` }}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map(date => (
            <Day
              key={iso(date)}
              date={date}
              list={bookingsOn[iso(date)] || []}
              inMonth={date.getMonth() === month.getMonth()}
              isToday={iso(date) === todayKey}
              isChosen={iso(date) === chosenDay}
              t={t}
              onHover={setHoveredDay}
              onChoose={key => setChosenDay(current => (current === key ? null : key))}
            />
          ))}
        </div>
      </motion.div>

      <AnimatePresence>
        {showList && (
          <motion.section
            aria-label="Bookings this month"
            className="w-full"
            style={{ flex: '1 1 0', minWidth: 0, maxWidth: 520 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="mb-1 text-2xl font-bold tracking-wide" style={{ color: t.TEXT, margin: 0 }}>Bookings</h2>
            <p className="mb-3 text-sm" style={{ color: t.MUTED }}>
              Point at a day to bring its bookings to the top. Click a booking to open it.
            </p>
            <motion.div layout className="flex flex-col overflow-y-auto rounded-xl" style={{ maxHeight: 560, border: `2px solid ${t.BORDER}` }}>
              {listed.length === 0 && <p className="p-4 text-sm" style={{ color: t.MUTED, margin: 0 }}>No bookings this month.</p>}
              <AnimatePresence initial={false}>
                {listed.map(date => (
                  <motion.div key={iso(date)} layout className="w-full" style={{ borderBottom: `2px solid ${t.BORDER}` }}>
                    {(bookingsOn[iso(date)] || []).map((r, index) => (
                      <motion.button
                        key={`${iso(date)}-${r.id}`}
                        type="button"
                        onClick={() => onSelect?.(r.id)}
                        className="block w-full p-3 text-left"
                        style={{ background: iso(date) === (hoveredDay || chosenDay) ? t.CARD2 : 'transparent', border: 0, borderBottom: `1px solid ${t.BORDER}`, cursor: 'pointer', fontFamily: 'inherit', color: t.TEXT }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, delay: index * 0.04 }}
                      >
                        <span className="mb-1 flex items-center justify-between gap-2 text-xs" style={{ color: t.MUTED }}>
                          <span>{longDay(date)}</span>
                          <span>
                            {r.checkIn === iso(date) ? `Arrives${r.checkInTime ? ` ${r.checkInTime}` : ''}` : r.checkOut === iso(date) ? `Leaves${r.checkOutTime ? ` ${r.checkOutTime}` : ''}` : 'Staying'}
                          </span>
                        </span>
                        <span className="block text-base font-semibold" style={{ textDecoration: r.status === 'cancelled' ? 'line-through' : 'none' }}>
                          {r.companyName || r.guestName || 'Guest'}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-xs" style={{ color: t.MUTED }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor[r.status] || '#9ca3af', flex: '0 0 auto' }} />
                          <span style={{ textTransform: 'capitalize' }}>{String(r.status || 'pending').replace(/-/g, ' ')}</span>
                          <span>· Room {(r.groupRooms || [r]).map(x => x.roomNumber).filter(Boolean).join(', ') || '—'}</span>
                        </span>
                      </motion.button>
                    ))}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
