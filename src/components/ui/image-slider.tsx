import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface ImageSliderProps {
  images: string[];
  interval?: number;
  className?: string;
  altPrefix?: string;
}

export function ImageSlider({
  images,
  interval = 5000,
  className = '',
  altPrefix = 'Lawiswis Kawayan Garden Resort',
}: ImageSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const safeImages = images.filter(Boolean);

  useEffect(() => {
    if (safeImages.length < 2 || reduceMotion) return undefined;
    const timer = window.setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % safeImages.length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [interval, reduceMotion, safeImages.length]);

  useEffect(() => {
    if (currentIndex >= safeImages.length) setCurrentIndex(0);
  }, [currentIndex, safeImages.length]);

  if (safeImages.length === 0) return null;

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#3B4530] ${className}`}>
      <AnimatePresence initial={false}>
        <motion.img
          key={safeImages[currentIndex]}
          src={safeImages[currentIndex]}
          alt={`${altPrefix} — resort view ${currentIndex + 1}`}
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: reduceMotion ? 0 : 0.8, ease: 'easeInOut' }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#182016]/85 via-[#182016]/15 to-[#182016]/10" />
      {safeImages.length > 1 && (
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
          {safeImages.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setCurrentIndex(index)}
              aria-label={`Show resort image ${index + 1}`}
              aria-current={currentIndex === index}
              className={`h-2 rounded-full transition-all duration-300 ${
                currentIndex === index ? 'w-6 bg-white' : 'w-2 bg-white/55 hover:bg-white'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
