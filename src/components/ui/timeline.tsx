import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

// Vertical timeline with a "beam" that fills as you scroll down it.
// Adapted from the Aceternity timeline: heading passed in, resort colours,
// and the beam's length is re-measured whenever the content resizes (e.g.
// when photos finish loading), so it always reaches the last entry.

export interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

interface TimelineProps {
  data: TimelineEntry[];
  eyebrow?: string;
  heading?: string;
  description?: string;
}

export const Timeline = ({ data, eyebrow, heading, description }: TimelineProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start 10%', 'end 50%'] });
  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div className="w-full bg-white md:px-10" ref={containerRef}>
      {(heading || description) && (
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 lg:px-10">
          {eyebrow && <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B7A4F]">{eyebrow}</div>}
          {heading && (
            <h2 className="mb-4 max-w-4xl text-3xl text-[#22261B] md:text-5xl" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              {heading}
            </h2>
          )}
          {description && <p className="max-w-xl text-sm leading-relaxed text-[#5c5a4c] md:text-base">{description}</p>}
        </div>
      )}

      <div ref={ref} className="relative mx-auto max-w-7xl pb-20">
        {data.map((item, index) => (
          <div key={`${item.title}-${index}`} className="flex justify-start pt-10 md:gap-10 md:pt-32">
            <div className="sticky top-32 z-40 flex max-w-xs flex-col items-center self-start md:w-full md:flex-row lg:max-w-sm">
              <div className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white md:left-3">
                <div className="h-4 w-4 rounded-full border border-[#d9cfae] bg-[#efe7cf] p-2" />
              </div>
              <h3
                className="hidden text-xl font-medium text-[#9a8f6a] md:block md:pl-20 md:text-4xl"
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              >
                {item.title}
              </h3>
            </div>

            <div className="relative w-full pl-20 pr-4 md:pl-4">
              <h3 className="mb-4 block text-left text-2xl font-medium text-[#9a8f6a] md:hidden" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                {item.title}
              </h3>
              {item.content}
            </div>
          </div>
        ))}

        {/* The beam: a faint track, with a gold fill that grows as you scroll. */}
        <div
          style={{ height: `${height}px` }}
          className="absolute left-8 top-0 w-[2px] overflow-hidden bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-[#e3dcc5] to-transparent to-[99%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)] md:left-8"
        >
          <motion.div
            style={{ height: heightTransform, opacity: opacityTransform }}
            className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-[#B8893B] from-[0%] via-[#3F6B45] via-[10%] to-transparent"
          />
        </div>
      </div>
    </div>
  );
};

export default Timeline;
