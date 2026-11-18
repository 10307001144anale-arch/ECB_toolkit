// Admin portal: the User portal's history page, view only (Admins do not generate).

import React from 'react';
import { ADMIN_GENERATION, GenerationProvider } from '../../lib/generation';
import HistoryPage from '../user/HistoryPage';

/** Every User's generation history. */
export function AdminHistory() {
  return (
    <GenerationProvider value={ADMIN_GENERATION}>
      <HistoryPage />
    </GenerationProvider>
  );
}
