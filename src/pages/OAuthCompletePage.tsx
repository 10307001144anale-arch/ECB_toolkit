import React, { useEffect } from 'react';
import { useRouter } from '../lib/router';

const NAMES: Record<string, string> = { microsoft: 'Microsoft', google: 'Google' };

function message(status: string, name: string) {
  switch (status) {
    case 'connected':
      return `${name} account connected. You can close this window.`;
    case 'denied':
      return 'Access was not granted. You can close this window and try again.';
    case 'state_mismatch':
      return 'The sign-in could not be confirmed. Please try again.';
    case 'signed_out':
      return 'Your session has ended. Reload the page and retry.';
    default:
      return `${name} sign-in failed. Please try again.`;
  }
}

/** Landing page for the Microsoft / Google OAuth redirect; notifies the opener window and closes. */
export function OAuthCompletePage() {
  const { query, navigate } = useRouter();
  const status = query.get('status') || 'error';
  const provider = query.get('provider') === 'google' ? 'google' : 'microsoft';
  useEffect(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'certigen-oauth', provider, status }, window.location.origin);
      setTimeout(() => window.close(), 400);
    } else {
      const t = setTimeout(() => navigate('/app/new', { replace: true }), 1500);
      return () => clearTimeout(t);
    }
  }, [status, provider, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-slate-700">
      <p>{message(status, NAMES[provider])}</p>
    </div>
  );
}
