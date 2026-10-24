import React from 'react';

// Booking progress, left to right. Clicking a neighbouring step moves the
// booking there (forwards or back); steps that would skip ahead are disabled
// (see getStatusTransitionError). Cancelling is a separate action.
export const STATUS_STEPS = [
  { id: 'pending', label: 'Pending', short: 'Pending' },
  { id: 'confirmed', label: 'Confirmed', short: 'Confirmed' },
  { id: 'checked-in', label: 'Checked in', short: 'In' },
  { id: 'checked-out', label: 'Checked out', short: 'Out' },
];

const DEFAULT_COLORS = {
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#ffffff',
  accent: '#9cb56f',
  accentText: '#0a1a0a',
  danger: '#dc2626',
};

/**
 * Props:
 *  status        current reservation status
 *  onSelect(id)  called when a different step is clicked
 *  onCancel()    optional; shows a cancel button (label from cancelLabel)
 *  busy          disables the steps while a change is saving
 *  lockedReason  when set, steps can't be clicked and this is shown instead
 *  stepNotes     { [stepId]: 'tooltip text' } e.g. why check-out needs payment
 *  getStepError  (stepId) => '' if allowed, or why that step can't be chosen
 *  compact       smaller version for list rows
 */
export default function StatusStepper({
  status, onSelect, onCancel, cancelLabel = 'Cancel booking', busy = false,
  lockedReason = '', stepNotes = {}, getStepError, compact = false, colors,
}) {
  const c = { ...DEFAULT_COLORS, ...colors };
  const cancelled = status === 'cancelled';
  const currentIndex = STATUS_STEPS.findIndex(step => step.id === status);
  const size = compact ? 20 : 28;

  return (
    <div style={{ display: 'grid', gap: compact ? 4 : 8 }}>
      {cancelled && (
        <div style={{ fontSize: compact ? 10 : 12, fontWeight: 700, color: c.danger }}>
          Cancelled{lockedReason ? '' : ' · click Pending to reopen'}
        </div>
      )}
      <ol aria-label="Booking status" style={{ display: 'flex', alignItems: 'flex-start', listStyle: 'none', margin: 0, padding: 0, opacity: cancelled ? 0.6 : 1 }}>
        {STATUS_STEPS.map((step, index) => {
          const done = !cancelled && index < currentIndex;
          const current = !cancelled && index === currentIndex;
          const stepError = !current && getStepError ? getStepError(step.id) : '';
          const clickable = !current && !busy && !lockedReason && !stepError && typeof onSelect === 'function';
          const note = stepNotes[step.id];
          return (
            <li key={step.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', minWidth: compact ? 34 : 64 }}>
              {index > 0 && (
                <span aria-hidden="true" style={{
                  position: 'absolute', top: size / 2 - 1, right: '50%', width: '100%', height: 2,
                  background: done || current ? c.accent : c.border,
                }} />
              )}
              <button
                type="button"
                disabled={!clickable}
                aria-current={current ? 'step' : undefined}
                aria-label={current ? `${step.label} (current)` : `Move to ${step.label}`}
                title={lockedReason || stepError || note || (current ? 'Current status' : `Move to ${step.label}`)}
                onClick={() => clickable && onSelect(step.id)}
                style={{
                  position: 'relative', zIndex: 1, width: size, height: size, borderRadius: '50%', padding: 0,
                  border: `2px solid ${done || current ? c.accent : c.border}`,
                  background: current ? c.accent : done ? `${c.accent}33` : c.background,
                  color: current ? c.accentText : c.text,
                  fontSize: compact ? 9 : 11, fontWeight: 700, fontFamily: 'inherit',
                  cursor: clickable ? 'pointer' : current ? 'default' : 'not-allowed',
                  opacity: stepError ? 0.45 : 1,
                }}
              >
                {done ? '✓' : index + 1}
                {note && !current && (
                  <span aria-hidden="true" style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: c.danger }} />
                )}
              </button>
              <span style={{ marginTop: 4, fontSize: compact ? 9 : 11, fontWeight: current ? 700 : 500, color: current ? c.text : c.muted, textAlign: 'center', whiteSpace: 'nowrap' }}>
                {compact ? step.short : step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {(onCancel || lockedReason) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {onCancel && !cancelled && !lockedReason && (!getStepError || !getStepError('cancelled')) && (
            <button type="button" onClick={onCancel} disabled={busy}
              style={{ border: 'none', background: 'transparent', padding: 0, color: c.danger, fontSize: compact ? 10 : 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {cancelLabel}
            </button>
          )}
          {lockedReason && <span style={{ fontSize: compact ? 10 : 11, color: c.muted }}>{lockedReason}</span>}
        </div>
      )}
    </div>
  );
}
