import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setMatch(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return match;
}

/** Touch-Geräte: kein Hover und kein Rechtsklick, daher öffnet Antippen ein Karten-Blatt. */
export const useIsTouch = () => useMediaQuery('(hover: none), (pointer: coarse)');
export const useIsMobile = () => useMediaQuery('(max-width: 860px)');
