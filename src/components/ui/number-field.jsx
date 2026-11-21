import React from 'react';

// Guest counts and other whole numbers: [−] [ 14 ] [+].
// The box takes digits only (no "e", "-" or "."), shows the number keypad on
// phones, can be cleared while typing, and is kept within min–max when the
// field loses focus. onChange always receives a string of digits ('' while
// the box is empty).
export default function NumberField({
  value,
  onChange,
  min = 0,
  max = 999,
  id,
  label,
  disabled = false,
  buttonStyle,
  inputStyle,
  style,
}) {
  const text = value === null || value === undefined ? '' : String(value);
  const number = Number(text);
  const current = text === '' || !Number.isFinite(number) ? min : number;
  const clamp = n => String(Math.min(max, Math.max(min, n)));
  const name = String(label || 'value').toLowerCase();

  const base = {
    border: '1px solid #e5e7eb', background: '#fff', color: '#111827', cursor: 'pointer',
    fontSize: 18, lineHeight: 1, width: 44, minWidth: 44, height: 44, borderRadius: 10, fontFamily: 'inherit',
  };
  const button = (disabledNow) => ({ ...base, ...buttonStyle, opacity: disabledNow ? 0.45 : 1, cursor: disabledNow ? 'not-allowed' : 'pointer' });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, ...style }}>
      <button type="button" aria-label={`Fewer ${name}`} disabled={disabled || current <= min}
        onClick={() => onChange(clamp(current - 1))} style={button(disabled || current <= min)}>−</button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        disabled={disabled}
        value={text}
        onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, String(max).length))}
        onBlur={() => onChange(clamp(text === '' ? min : number))}
        onFocus={event => event.target.select()}
        style={{
          width: 72, minWidth: 0, flex: '1 1 72px', maxWidth: 120, height: 44, boxSizing: 'border-box',
          textAlign: 'center', fontSize: 16, fontWeight: 600, border: '1px solid #e5e7eb', borderRadius: 10,
          background: '#fff', color: '#111827', fontFamily: 'inherit', outline: 'none', ...inputStyle,
        }}
      />
      <button type="button" aria-label={`More ${name}`} disabled={disabled || current >= max}
        onClick={() => onChange(clamp(current + 1))} style={button(disabled || current >= max)}>+</button>
    </div>
  );
}
