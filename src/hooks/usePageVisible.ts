import { useState, useEffect } from 'react';

/**
 * Tracks whether the browser tab is currently visible to the user.
 */
export function usePageVisible(): boolean {
  const [isPageVisible, setIsPageVisible] = useState(
    () => document.visibilityState === 'visible'
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return isPageVisible;
}
