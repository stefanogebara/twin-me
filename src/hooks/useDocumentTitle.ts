import { useEffect, useRef } from 'react';

const BASE_TITLE = 'Twin Me';

/**
 * Set the document title for the current page.
 * Restores the base title on unmount.
 *
 * @param title - Page-specific title (e.g. "Dashboard")
 *   Rendered as "Dashboard | Twin Me"
 */
export function useDocumentTitle(title: string): void {
  const prevTitle = useRef(document.title);

  useEffect(() => {
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = prevTitle.current;
    };
  }, [title]);
}

export default useDocumentTitle;
