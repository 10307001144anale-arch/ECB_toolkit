// The app uses one light colour scheme (see src/styles/theme.css). This file
// only marks which portal is shown, for portal-specific styling.

import React, { useEffect } from 'react';
import type { PortalId } from '../../shared/types';

/** Applies the light scheme and clears any dark-mode choice saved by an earlier version. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    try {
      localStorage.removeItem('certigen.theme');
    } catch {
      /* storage unavailable */
    }
  }, []);
  return <>{children}</>;
}

/** Marks the current portal on <html>. */
export function usePortalAccent(portal: PortalId) {
  useEffect(() => {
    document.documentElement.dataset.portal = portal;
  }, [portal]);
}
