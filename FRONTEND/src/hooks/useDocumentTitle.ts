import { useEffect } from "react";

const SITE_NAME = "Meridian Lending";

/** Sets the browser tab title for the current route, restoring the default on unmount. */
export function useDocumentTitle(pageTitle?: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = previous;
    };
  }, [pageTitle]);
}
