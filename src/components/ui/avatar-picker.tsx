import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Card, CardContent } from './card.tsx';
import { AVATAR_PRESETS, BeamAvatar } from './beam-avatar.tsx';

// Avatar picker for staff (adapted from the shared AvatarPicker design):
// the chosen avatar spins into place at the top, and the resort's avatar
// sheet is the list of choices. framer-motion is the same library as
// "motion", already installed here.

const mainAvatarVariants = {
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
};

const pickerVariants = {
  container: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { staggerChildren: 0.02, delayChildren: 0.15 } },
  },
  item: {
    initial: { y: 16, opacity: 0 },
    animate: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } },
  },
};

const selectedVariants = {
  initial: { opacity: 0, rotate: -180 },
  animate: { opacity: 1, rotate: 0, transition: { type: 'spring', stiffness: 200, damping: 15 } },
  exit: { opacity: 0, rotate: 180, transition: { duration: 0.2 } },
};

interface AvatarPickerProps {
  /** Current avatar seed ('' when none chosen yet). */
  value?: string;
  name?: string;
  subtitle?: string;
  saving?: boolean;
  error?: string;
  onSave: (seed: string) => void;
  onCancel?: () => void;
  options?: string[];
  /** When given, the name becomes an editable field (profile editing). */
  onNameChange?: (name: string) => void;
}

export function AvatarPicker({
  value = '', name = 'Me', subtitle = 'Select your avatar', saving = false, error = '', onSave, onCancel, options = AVATAR_PRESETS, onNameChange,
}: AvatarPickerProps) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState(value || options[0]);
  const [rotation, setRotation] = useState(0);

  const choose = (seed: string) => {
    if (seed === selected) return;
    setRotation(previous => previous + 1080); // three turns each time
    setSelected(seed);
  };
  const surprise = () => {
    const others = options.filter(seed => seed !== selected);
    choose(others[Math.floor(Math.random() * others.length)]);
  };

  return (
    <motion.div initial="initial" animate="animate" className="w-full">
      <Card className="mx-auto w-full max-w-md overflow-hidden bg-gradient-to-b from-card to-muted/30">
        <CardContent className="!p-0">
          {/* Header band */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: '7rem', transition: { height: { type: 'spring', stiffness: 100, damping: 20 } } }}
            className="w-full bg-gradient-to-r from-primary/25 to-primary/10"
          />

          <div className="-mt-16 px-5 pb-6 sm:px-8">
            {/* Chosen avatar */}
            <motion.div
              className="relative mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-card shadow-md"
              variants={mainAvatarVariants}
            >
              <motion.div
                className="flex h-full w-full items-center justify-center"
                animate={{ rotate: reduceMotion ? 0 : rotation }}
                transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              >
                <BeamAvatar seed={selected} size="100%" title="Selected avatar" />
              </motion.div>
            </motion.div>

            <motion.div className="mt-4 text-center" variants={pickerVariants.item}>
              {onNameChange ? (
                <label className="mx-auto block max-w-xs text-left">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Your name</span>
                  <input
                    value={name}
                    maxLength={80}
                    onChange={event => onNameChange(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-base font-bold text-foreground outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              ) : (
                <h2 className="text-xl font-bold text-foreground">{name}</h2>
              )}
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </motion.div>

            {/* Choices */}
            <motion.div
              role="radiogroup"
              aria-label="Avatars"
              className="mt-5 grid max-h-[260px] grid-cols-5 justify-items-center gap-3 overflow-y-auto px-1 py-2 sm:grid-cols-8"
              variants={pickerVariants.container}
            >
              {options.map(seed => {
                const isSelected = seed === selected;
                return (
                  <motion.button
                    key={seed}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Avatar ${options.indexOf(seed) + 1}`}
                    onClick={() => choose(seed)}
                    className={cn('relative h-11 w-11 rounded-full', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}
                    variants={pickerVariants.item}
                    whileHover={reduceMotion ? undefined : { y: -2, transition: { duration: 0.2 } }}
                    whileTap={reduceMotion ? undefined : { y: 0, scale: 0.95 }}
                  >
                    <BeamAvatar seed={seed} size="100%" />
                    <AnimatePresence>
                      {isSelected && (
                        <motion.span
                          className="absolute inset-0 rounded-full ring-2 ring-primary ring-offset-2 ring-offset-card"
                          variants={selectedVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        />
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </motion.div>

            {error && <p role="alert" className="mt-3 text-center text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={surprise}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">
                <i className="ti ti-arrows-shuffle" aria-hidden="true" /> Surprise me
              </button>
              <div className="flex gap-2">
                {onCancel && (
                  <button type="button" onClick={onCancel}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                    Cancel
                  </button>
                )}
                <button type="button" disabled={saving} onClick={() => onSave(selected)}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  {saving ? 'Saving…' : onNameChange ? 'Save profile' : 'Save avatar'}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default AvatarPicker;
