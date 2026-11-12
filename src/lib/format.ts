export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDateOnly(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return formatDateOnly(ts);
}

export function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return 'estimating…';
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m < 60 ? `${m} min ${s} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export const ACTIVITY_LABELS: Record<string, string> = {
  login: 'Signed in',
  password_changed: 'Changed password',
  template_created: 'Created template',
  template_published: 'Published template',
  template_unpublished: 'Unpublished template',
  template_archived: 'Archived template',
  template_unarchived: 'Restored template from archive',
  template_duplicated: 'Duplicated template',
  template_deleted: 'Deleted template',
  template_version_restored: 'Restored template version',
  template_access_changed: 'Changed template access',
  client_created: 'Created client',
  client_updated: 'Updated client',
  client_activated: 'Activated client',
  client_deactivated: 'Deactivated client',
  client_password_reset: 'Reset client password',
  client_access_changed: 'Changed client template access',
  preset_saved: 'Saved content preset',
  batch_started: 'Started generation',
  batch_completed: 'Finished generation',
  certificate_revoked: 'Revoked certificate',
  microsoft_connected: 'Connected Microsoft Excel',
  microsoft_disconnected: 'Disconnected Microsoft Excel',
  ai_detection_used: 'Used AI box detection',
  admin_bootstrapped: 'Administrator account created',
  admin_created_cli: 'Administrator account created',
};
