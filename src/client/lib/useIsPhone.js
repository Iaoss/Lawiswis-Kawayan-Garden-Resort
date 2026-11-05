import { useEffect, useState } from 'react';

// True on phone-size screens (640px wide or less), the same breakpoint as
// src/client/mobile.css. Updates when the window is resized or rotated.
const QUERY = '(max-width: 640px)';

export function useIsPhone() {
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const list = window.matchMedia(QUERY);
    const update = () => setIsPhone(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, []);
  return Boolean(isPhone);
}
