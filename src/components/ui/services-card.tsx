import * as React from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { cn } from '../../lib/utils';
import { Button } from './button.jsx';

// Animated service cards in a carousel (adapted from the supplied component).
// Changes for this project: relative imports (no "@/" alias), a Previous
// button and dots alongside Next, an optional photo and highlight list on
// each card, and keyboard support kept from the original.

type EmblaApi = ReturnType<typeof useEmblaCarousel>[1];
type CarouselOptions = Parameters<typeof useEmblaCarousel>[0];

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: EmblaApi;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  selectedIndex: number;
  snapCount: number;
};

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);
  if (!context) throw new Error('useCarousel must be used within a <Carousel />');
  return context;
}

const Carousel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { opts?: CarouselOptions; label?: string }>(
  ({ opts, className, children, label, ...props }, ref) => {
    const [carouselRef, api] = useEmblaCarousel({ ...opts, axis: 'x' });
    const [canScrollPrev, setCanScrollPrev] = React.useState(false);
    const [canScrollNext, setCanScrollNext] = React.useState(false);
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const [snapCount, setSnapCount] = React.useState(0);

    const onSelect = React.useCallback((current: EmblaApi) => {
      if (!current) return;
      setCanScrollPrev(current.canScrollPrev());
      setCanScrollNext(current.canScrollNext());
      setSelectedIndex(current.selectedScrollSnap());
      setSnapCount(current.scrollSnapList().length);
    }, []);

    const scrollPrev = React.useCallback(() => api?.scrollPrev(), [api]);
    const scrollNext = React.useCallback(() => api?.scrollNext(), [api]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); scrollPrev(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); scrollNext(); }
    }, [scrollPrev, scrollNext]);

    React.useEffect(() => {
      if (!api) return undefined;
      onSelect(api);
      api.on('reInit', onSelect);
      api.on('select', onSelect);
      return () => {
        api.off('reInit', onSelect);
        api.off('select', onSelect);
      };
    }, [api, onSelect]);

    return (
      <CarouselContext.Provider value={{ carouselRef, api, scrollPrev, scrollNext, canScrollPrev, canScrollNext, selectedIndex, snapCount }}>
        <div
          ref={ref}
          onKeyDownCapture={handleKeyDown}
          className={cn('relative', className)}
          role="region"
          aria-roledescription="carousel"
          aria-label={label}
          {...props}
        >
          {children}
        </div>
      </CarouselContext.Provider>
    );
  },
);
Carousel.displayName = 'Carousel';

const CarouselContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const { carouselRef } = useCarousel();
  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div ref={ref} className={cn('-ml-4 flex', className)} {...props} />
    </div>
  );
});
CarouselContent.displayName = 'CarouselContent';

const CarouselItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} role="group" aria-roledescription="slide" className={cn('min-w-0 shrink-0 grow-0 basis-full pl-4', className)} {...props} />
));
CarouselItem.displayName = 'CarouselItem';

function CarouselControls() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext, selectedIndex, snapCount, api } = useCarousel();
  const roundButton = 'h-11 w-11 rounded-full border border-[#d9d2bd] bg-white p-0 text-[#22261B] shadow-sm hover:bg-[#f4efe1] disabled:opacity-40';
  return (
    <div className="mt-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2" aria-label="Choose a slide">
        {Array.from({ length: snapCount }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === selectedIndex ? 'true' : undefined}
            onClick={() => api?.scrollTo(index)}
            className={cn('h-2 rounded-full transition-all duration-300', index === selectedIndex ? 'w-7 bg-[#3F6B45]' : 'w-2 bg-[#cfc8b1] hover:bg-[#b5ad93]')}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" className={roundButton} onClick={scrollPrev} disabled={!canScrollPrev} aria-label="Previous slide">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button type="button" className={roundButton} onClick={scrollNext} disabled={!canScrollNext} aria-label="Next slide">
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export interface Service {
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  image?: string;
  alt?: string;
  highlights?: string[];
}

const ServiceCard = ({ service, index }: { service: Service; index: number }) => {
  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.1 } },
  };
  const Icon = service.icon;

  return (
    <motion.article
      variants={cardVariants}
      className={cn('group relative flex h-[480px] w-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-3', service.gradient)}
    >
      {service.image && (
        <div className="relative h-44 w-full overflow-hidden rounded-2xl">
          <img src={service.image} alt={service.alt || service.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <span className="absolute left-3 top-3 rounded-full bg-black/35 px-3 py-1 font-mono text-[11px] text-white backdrop-blur-sm">( {service.number} )</span>
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <Icon className="mb-4 h-9 w-9 text-[#22261B]" aria-hidden="true" />
        <h3 className="mb-2 text-lg font-semibold uppercase tracking-wider text-[#22261B]">{service.title}</h3>
        <p className="text-sm leading-relaxed text-[#22261B]/75">{service.description}</p>
        {service.highlights && (
          <ul className="mt-auto flex flex-wrap gap-2 pt-4">
            {service.highlights.map(item => (
              <li key={item} className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-[#22261B]">{item}</li>
            ))}
          </ul>
        )}
      </div>
    </motion.article>
  );
};

export const ServiceCarousel = ({ services, label = 'Amenities' }: { services: Service[]; label?: string }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <Carousel ref={ref} label={label} opts={{ align: 'start', loop: true }}>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} transition={{ staggerChildren: 0.1 }}>
          <CarouselContent>
            {services.map((service, index) => (
              <CarouselItem key={service.number} className="md:basis-1/2 lg:basis-1/3">
                <div className="p-1">
                  <ServiceCard service={service} index={index} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </motion.div>
        <CarouselControls />
      </Carousel>
    </div>
  );
};

export default ServiceCarousel;
