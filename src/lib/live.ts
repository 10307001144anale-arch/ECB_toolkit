// Live updates across the three portals: one EventSource per browser tab
// (opened while someone is signed in) tells pages which data sets changed,
// e.g. "templates" after the Super Admin publishes. Pages reload what they show.

import { useEffect, useRef } from 'react';
import { currentPortal } from './api';

export type LiveTopic = 'templates' | 'users' | 'activities' | 'batches' | 'presets' | 'admins';
type Listener = (topics: LiveTopic[]) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;

function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource(`/api/events?portal=${currentPortal()}`, { withCredentials: true });
  source.addEventListener('change', (e) => {
    try {
      const { topics } = JSON.parse((e as MessageEvent).data) as { topics: LiveTopic[] };
      listeners.forEach((l) => l(topics));
    } catch {
      /* ignore malformed messages */
    }
  });
  source.onerror = () => {
    // Signed out (401) or server restart: EventSource retries by itself while open.
    if (source && source.readyState === EventSource.CLOSED) {
      source = null;
      if (listeners.size) setTimeout(connect, 5000);
    }
  };
}

export function disconnectLive() {
  source?.close();
  source = null;
}

/** Calls `reload` (debounced) whenever one of `topics` changes anywhere in the system. */
export function useLive(topics: LiveTopic[], reload: () => void) {
  const ref = useRef(reload);
  ref.current = reload;
  const key = topics.join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wanted = new Set(key.split(','));
    const l: Listener = (changed) => {
      if (!changed.some((t) => wanted.has(t))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => ref.current(), 250);
    };
    listeners.add(l);
    connect();
    // Also refresh when the tab comes back into view.
    const onVis = () => document.visibilityState === 'visible' && ref.current();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      listeners.delete(l);
      document.removeEventListener('visibilitychange', onVis);
      if (timer) clearTimeout(timer);
    };
  }, [key]);
}
