// The three portals: who uses them, where they live, and their navigation.
// Each portal has its own sign-in page, accent colour and sidebar.

import React from 'react';
import {
  Activity,
  BarChart3,
  BookmarkCheck,
  Building2,
  CalendarDays,
  FilePlus2,
  History,
  Home,
  LayoutTemplate,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import type { PortalId, Role } from '../../shared/types';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

export interface PortalDef {
  id: PortalId;
  name: string;
  /** Short badge shown in the header. */
  badge: string;
  tagline: string;
  base: string;
  login: string;
  icon: React.ReactNode;
  nav: NavItem[];
}

const i = (C: React.ComponentType<{ className?: string }>) => <C className="h-[18px] w-[18px]" />;

export const PORTALS: Record<PortalId, PortalDef> = {
  superadmin: {
    id: 'superadmin',
    name: 'Super Admin',
    badge: 'Super Admin',
    tagline: 'Templates, fields and design',
    base: '/superadmin',
    login: '/superadmin/login',
    icon: <ShieldCheck className="h-5 w-5" />,
    nav: [
      { to: '/superadmin', label: 'Dashboard', icon: i(Home), exact: true },
      { to: '/superadmin/templates', label: 'Templates', icon: i(LayoutTemplate) },
      { to: '/superadmin/team', label: 'Admin accounts', icon: i(UserCog) },
      { to: '/superadmin/audit', label: 'Audit log', icon: i(ScrollText) },
    ],
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    badge: 'Admin',
    tagline: 'Users, activities and certificates',
    base: '/admin',
    login: '/admin/login',
    icon: <Building2 className="h-5 w-5" />,
    nav: [
      { to: '/admin', label: 'Dashboard', icon: i(BarChart3), exact: true },
      { to: '/admin/users', label: 'Users', icon: i(Users) },
      { to: '/admin/activities', label: 'Activities', icon: i(CalendarDays) },
      { to: '/admin/history', label: 'History', icon: i(History) },
      { to: '/admin/audit', label: 'Audit log', icon: i(ScrollText) },
    ],
  },
  user: {
    id: 'user',
    name: 'User',
    badge: 'User',
    tagline: 'Create and download certificates',
    base: '/',
    login: '/login',
    icon: <Activity className="h-5 w-5" />,
    nav: [
      { to: '/', label: 'Home', icon: i(Home), exact: true },
      { to: '/new', label: 'New certificates', icon: i(FilePlus2) },
      { to: '/history', label: 'History', icon: i(History) },
      { to: '/presets', label: 'Wording presets', icon: i(BookmarkCheck) },
    ],
  },
};

export function homeFor(role: Role): string {
  return PORTALS[role].base;
}

/** Which portal a path belongs to. */
export function portalOfPath(path: string): PortalId {
  if (path === '/superadmin' || path.startsWith('/superadmin/')) return 'superadmin';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return 'user';
}
