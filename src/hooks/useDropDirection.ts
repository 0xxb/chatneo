import { useRef, useEffect, useState } from 'react';

/**
 * Detects whether a dropdown should open below (true) or above (false)
 * based on available space above the parent element.
 */
export function useDropDirection(visible: boolean, threshold = 200) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropDown, setDropDown] = useState(false);

  useEffect(() => {
    if (!visible || !containerRef.current) return;
    const parent = containerRef.current.parentElement;
    if (!parent) return;

    const update = () => setDropDown(parent.getBoundingClientRect().top < threshold);
    update();

    const scrollParent = parent.closest('[class*="overflow"]') ?? window;
    scrollParent.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      scrollParent.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [visible, threshold]);

  return { containerRef, dropDown };
}
