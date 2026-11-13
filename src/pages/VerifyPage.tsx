import React, { useEffect, useState } from 'react';
import { BadgeCheck, Search, ShieldAlert, ShieldX } from 'lucide-react';
import { api } from '../lib/api';
import { useRouter } from '../lib/router';
import { Button, Card, Input, Spinner } from '../components/ui';
import { Brand } from '../components/AppShell';
import { formatDateOnly } from '../lib/format';
import type { VerificationResult } from '../../shared/types';

export function VerifyPage({ id }: { id: string | null }) {
  const { navigate } = useRouter();
  const [input, setInput] = useState(id || '');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Verify a certificate · CertiGen';
    setResult(null);
    setError(null);
    if (!id) return;
    setInput(id);
    setLoading(true);
    api
      .get<VerificationResult>(`/api/public/verify/${encodeURIComponent(id)}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex justify-center">
          <Brand subtitle="Certificate verification" />
        </div>
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Verify a certificate</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the certificate ID printed on the certificate, or scan its QR code.</p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = input.trim().toUpperCase();
              if (v) navigate(`/verify/${encodeURIComponent(v)}`);
            }}
          >
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="CG-XXXX-XXXX-XXXX" aria-label="Certificate ID" className="font-mono uppercase" />
            <Button type="submit" variant="primary" icon={<Search className="h-4 w-4" />}>
              Verify
            </Button>
          </form>

          {loading && <Spinner label="Checking…" />}
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          {result && !loading && (
            <div className="mt-6">
              {result.valid ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <BadgeCheck className="h-6 w-6" />
                    <p className="text-base font-semibold">Valid certificate</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-y-2 text-sm">
                    {result.recipientName && (
                      <>
                        <dt className="text-slate-500">Awarded to</dt>
                        <dd className="col-span-2 font-medium text-slate-900">{result.recipientName}</dd>
                      </>
                    )}
                    <dt className="text-slate-500">Certificate</dt>
                    <dd className="col-span-2 text-slate-900">{result.templateTitle}</dd>
                    <dt className="text-slate-500">Event / batch</dt>
                    <dd className="col-span-2 text-slate-900">{result.batchName}</dd>
                    {result.issuer && (
                      <>
                        <dt className="text-slate-500">Issued by</dt>
                        <dd className="col-span-2 text-slate-900">{result.issuer}</dd>
                      </>
                    )}
                    <dt className="text-slate-500">Issued on</dt>
                    <dd className="col-span-2 text-slate-900">{formatDateOnly(result.issuedAt)}</dd>
                    <dt className="text-slate-500">ID</dt>
                    <dd className="col-span-2 font-mono text-slate-900">{result.certificateId}</dd>
                  </dl>
                </div>
              ) : result.status === 'revoked' ? (
                <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                  <ShieldAlert className="h-6 w-6 shrink-0" />
                  <div>
                    <p className="font-semibold">This certificate has been revoked</p>
                    <p className="mt-1 text-sm">It was issued but is no longer valid. Contact the issuer for details.</p>
                  </div>
                </div>
              ) : result.status === 'void' ? (
                <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                  <ShieldAlert className="h-6 w-6 shrink-0" />
                  <div>
                    <p className="font-semibold">This certificate is no longer valid</p>
                    <p className="mt-1 text-sm">It was not completed or has been replaced by a corrected certificate. Ask the issuer for the current version.</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
                  <ShieldX className="h-6 w-6 shrink-0" />
                  <div>
                    <p className="font-semibold">Not a valid certificate</p>
                    <p className="mt-1 text-sm">No valid certificate was found with ID <span className="font-mono">{result.certificateId}</span>. Check the ID for typing mistakes.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
