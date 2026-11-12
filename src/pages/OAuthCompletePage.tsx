import React, { useEffect } from 'react';
import { useRouter } from '../lib/router';

const MESSAGES: Record<string, string> = {
  connected: 'Microsoft account connected. You can close this window.',
  denied: 'Access was not granted. You can close this window and try again.',
  state_mismatch: 'The sign-in could not be confirmed. Please try again.',
  signed_out: 'Your CertiGen session has ended. Sign in again and retry.',
  error: 'Microsoft sign-in failed. Please try again.',
};

/** Landing page for the Microsoft OAuth redirect; notifies the opener window and closes. */
export function OAuthCompletePage() {
  const { query, navigate } = useRouter();
  const status = query.get('status') || 'error';
  useEffect(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'certigen-microsoft', status }, window.location.origin);
      setTimeout(() => window.close(), 400);
    } else {
      const t = setTimeout(() => navigate('/app/new', { replace: true }), 1500);
      return () => clearTimeout(t);
    }
  }, [status, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-slate-700">
      <p>{MESSAGES[status] || MESSAGES.error}</p>
    </div>
  );
}
