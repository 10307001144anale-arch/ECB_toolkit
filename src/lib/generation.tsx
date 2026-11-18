// The certificate generation flow (wizard, history, presets) runs in two
// portals: Users generate for themselves; Admins generate on behalf of a User
// (and optionally one of that User's Activities). This context tells the
// shared pages which API and paths to use.

import React, { createContext, useContext } from 'react';

export interface GenerationPortal {
  mode: 'user' | 'admin';
  /** API base: /api/user or /api/admin/gen (same routes). */
  api: string;
  home: string;
  newPath: string;
  historyPath: string;
  presetsPath: string;
}

export const USER_GENERATION: GenerationPortal = { mode: 'user', api: '/api/user', home: '/', newPath: '/new', historyPath: '/history', presetsPath: '/presets' };
export const ADMIN_GENERATION: GenerationPortal = {
  mode: 'admin',
  api: '/api/admin/gen',
  home: '/admin',
  newPath: '/admin/generate',
  historyPath: '/admin/history',
  presetsPath: '/admin/presets',
};

const Ctx = createContext<GenerationPortal>(USER_GENERATION);

export function GenerationProvider({ value, children }: { value: GenerationPortal; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGeneration() {
  return useContext(Ctx);
}
