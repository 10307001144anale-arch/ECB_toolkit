// Client guided workflow in three steps:
// 1 Template & wording · 2 Participant data (columns, photos, signatures) · 3 Preview & generate.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { api, fetchFile, getConfig, verifyBaseUrl, type AppConfig } from '../../lib/api';
import { setNavigationBlocker, useRouter } from '../../lib/router';
import { Alert, Button, PageHeader, Spinner, cx } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { BatchRecord, ClientTemplate, ContentPreset } from '../../../shared/types';
import { CertificateRenderer } from '../../engine/renderer';
import { analysePlaceholders, autoMapping, contentIssues, fitContentToLayout, registeredNames, validateRows, type BatchContext } from '../../engine/batch';
import { initialState, type Derived, type StepId, type WizardState } from './wizard/state';
import { getBatchSession } from '../../engine/localStore';
import { ImageLibrary } from '../../engine/images';
import { StepDesign } from './wizard/StepDesign';
import { StepData } from './wizard/StepData';
import { StepPreview } from './wizard/StepPreview';
import { StepGenerate } from './wizard/StepGenerate';

const STEP_LABELS: Record<StepId, string> = {
  design: 'Template & wording',
  data: 'Participant data',
  generate: 'Preview & generate',
};
const STEPS: StepId[] = ['design', 'data', 'generate'];

export default function BatchWizard() {
  const { query } = useRouter();
  const { showToast } = useToast();
  const [w, setW] = useState<WizardState>(initialState);
  const [step, setStep] = useState<StepId>('design');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [booting, setBooting] = useState(true);

  const set = useCallback((patch: Partial<WizardState> | ((s: WizardState) => Partial<WizardState>)) => {
    setW((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  /** Selecting a template loads its artwork into the renderer. */
  const chooseTemplate = useCallback(
    async (t: ClientTemplate, opts?: { content?: WizardState['content'] | null; preset?: ContentPreset | null; mapping?: BatchRecord['mapping']; name?: string }) => {
      set({
        template: t,
        renderer: null,
        rendererError: null,
        content: fitContentToLayout(t.layout, opts?.content ?? null),
        preset: opts?.preset ?? null,
        mapping: opts?.mapping ? { ...opts.mapping, idColumn: opts.mapping.idColumn ?? null } : { placeholders: {}, recipientColumn: null, idColumn: null },
        crops: {},
        overflow: new Map(),
        overflowChecked: false,
        batchName: opts?.name || '',
        generatedBatchId: null,
      });
      try {
        const r = await CertificateRenderer.load(t.layout, fetchFile);
        set((s) => (s.template?.versionId === t.versionId ? { renderer: r } : {}));
      } catch (e: any) {
        set({ rendererError: e.message || 'The template could not be loaded.' });
      }
    },
    [set]
  );

  // Deep links: ?template=, ?preset=, ?from= (duplicate a previous batch).
  useEffect(() => {
    (async () => {
      try {
        const edit = query.get('edit');
        const from = query.get('from');
        if (edit) {
          const { batch } = await api.get<{ batch: BatchRecord }>(`/api/client/batches/${edit}`);
          const t = await api.get<ClientTemplate>(`/api/client/templates/${batch.templateId}`);
          const session = await getBatchSession(edit).catch(() => undefined);
          await chooseTemplate(t, { content: batch.content, mapping: batch.mapping, name: `${batch.name} (edited)` });
          if (t.versionId !== batch.templateVersionId) showToast('The template has been updated since this batch. Check the result before generating.', 'info');
          if (session) {
            const pos = Number(query.get('pos'));
            const focusRow = Number.isInteger(pos) && session.rowIndices[pos] !== undefined ? session.rowIndices[pos] : null;
            set({
              data: session.data,
              images: new ImageLibrary(session.images),
              imagesVersion: 1,
              crops: session.crops || {},
              excluded: new Set(session.excluded || []),
              editingFrom: { id: batch.id, name: batch.name },
              focusRow,
            });
            setStep('generate');
          } else {
            set({ editingFrom: { id: batch.id, name: batch.name } });
            showToast('The participant list is no longer stored in this browser. Add it again to regenerate.', 'info');
            setStep('data');
          }
          return;
        }

        const presetId = query.get('preset');
        let templateId = query.get('template');
        if (from) {
          const { batch } = await api.get<{ batch: BatchRecord }>(`/api/client/batches/${from}`);
          const t = await api.get<ClientTemplate>(`/api/client/templates/${batch.templateId}`);
          await chooseTemplate(t, { content: batch.content, mapping: batch.mapping, name: `${batch.name} (copy)` });
          if (t.versionId !== batch.templateVersionId) showToast('The template has been updated since that batch. Check the wording before generating.', 'info');
          setStep('design');
        } else if (presetId) {
          const presets = await api.get<ContentPreset[]>('/api/client/presets');
          const p = presets.find((x) => x.id === presetId);
          if (p) {
            const t = await api.get<ClientTemplate>(`/api/client/templates/${p.templateId}`);
            await chooseTemplate(t, { content: p.content, preset: p });
            setStep('design');
          }
        } else if (templateId) {
          const t = await api.get<ClientTemplate>(`/api/client/templates/${templateId}`);
          await chooseTemplate(t);
          setStep('design');
        }
      } catch (e: any) {
        showToast(e.message, 'error');
      } finally {
        setBooting(false);
      }
    })();
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- derived state

  const d: Derived = useMemo(() => {
    const layout = w.template?.layout;
    const headers = w.data?.headers || [];
    if (!layout) return { registered: new Set(), placeholders: [], contentIssues: [], ctx: null, checks: [], needsImages: false, readyRows: [], errorRows: [] };
    const registered = registeredNames(w.content, headers);
    const placeholders = analysePlaceholders(layout, w.content, registered);
    const issues = contentIssues(layout, w.content);
    const needsImages = layout.boxes.some((b) => b.type === 'photo' || (b.type === 'signature' && (b.source !== 'fixed' || !b.fixedSignatureFileId)));
    const fixedAvailable = new Set(layout.boxes.filter((b) => b.type === 'signature' && b.fixedSignatureFileId).map((b) => b.key));
    const ctx: BatchContext = {
      layout,
      content: w.content,
      mapping: w.mapping,
      placeholders,
      registered,
      images: w.images,
      crops: w.crops,
      hasFixedSignature: (k) => fixedAvailable.has(k),
      verifyBaseUrl: verifyBaseUrl(config),
      today: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
    const checks = w.data ? validateRows(ctx, w.data.rows) : [];
    const readyRows: number[] = [];
    const errorRows: number[] = [];
    checks.forEach((c, i) => {
      if (w.excluded.has(i)) return;
      if (c.errors.length) errorRows.push(i);
      else readyRows.push(i);
    });
    return { registered, placeholders, contentIssues: issues, ctx, checks, needsImages, readyRows, errorRows };
    // imagesVersion forces recomputation when the (mutable) image library changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.template, w.content, w.data, w.mapping, w.images, w.imagesVersion, w.crops, w.excluded, config]);

  // Re-run automatic matching only when the set of fields or the columns change,
  // so a client's manual choices are kept.
  const placeholderKey = d.placeholders.map((p) => p.key).join('|');
  const headerKey = w.data?.headers.join('|') || '';
  useEffect(() => {
    if (!w.data) return;
    const next = autoMapping(d.placeholders, w.data.headers, w.mapping, w.template?.layout, w.content);
    if (JSON.stringify(next) !== JSON.stringify(w.mapping)) set({ mapping: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholderKey, headerKey]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const busy = !!w.data && !w.generatedBatchId;
    if (!busy) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    setNavigationBlocker(() => window.confirm('Leave this batch? The participant data you added will be cleared.'));
    return () => {
      window.removeEventListener('beforeunload', onBefore);
      setNavigationBlocker(null);
    };
  }, [w.data, w.generatedBatchId]);

  // ---------------------------------------------------------------- steps

  const steps = STEPS;
  const unmapped = d.placeholders.filter((p) => !p.system && !w.mapping.placeholders[p.key]?.column);
  const imageProblems = useMemo(() => {
    const out: string[] = [];
    if (!w.template) return out;
    for (const b of w.template.layout.boxes) {
      if (b.type === 'signature') {
        const s = w.content.signatures[b.key];
        if (!s || s.mode === 'none') {
          if (b.required) out.push(`Choose a signature for "${b.label}".`);
        } else if (s.mode === 'single' && !w.images.find(s.fileName)) out.push(`Draw or upload the signature for "${b.label}".`);
        else if (s.mode === 'column' && !s.column) out.push(`Choose the column with signature file names for "${b.label}".`);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.template, w.content, w.images, w.imagesVersion]);

  const blockers: Record<StepId, string | null> = {
    design: !w.template
      ? 'Choose a template.'
      : w.rendererError
        ? w.rendererError
        : !w.renderer
          ? 'Loading the template…'
          : d.contentIssues.some((i) => i.level === 'error')
            ? 'Fix the highlighted wording first.'
            : null,
    data: !w.data ? 'Add your participant list.' : unmapped.length ? `Choose a column for ${unmapped.map((p) => `{{${p.name}}}`).join(', ')}.` : imageProblems[0] || null,
    generate: null,
  };


  const idx = steps.indexOf(step);
  const canReach = (s: StepId) => {
    const i = steps.indexOf(s);
    return steps.slice(0, i).every((p) => !blockers[p]);
  };
  const goTo = useCallback((s: StepId) => setStep(s), []);
  const next = () => {
    if (blockers[step]) return;
    const n = steps[idx + 1];
    if (n) {
      setStep(n);
      window.scrollTo(0, 0);
    }
  };

  if (booting) return <Spinner label="Preparing…" />;

  const props = { w, d, set, goTo };
  const locked = !!w.generatedBatchId && step === 'generate';

  return (
    <>
      <PageHeader
        title={w.editingFrom ? 'Edit certificates' : 'New certificate batch'}
        description={w.template ? `${w.template.title} · version ${w.template.versionNumber}` : 'Follow the steps to create personalised certificates.'}
        breadcrumbs={[{ label: 'Home', to: '/app' }, ...(w.editingFrom ? [{ label: 'History', to: '/app/history' }, { label: 'Edit' }] : [{ label: 'New batch' }])]}
      />

      {/* Stepper */}
      <nav aria-label="Progress" className="mb-6">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {steps.map((s, i) => {
            const done = i < idx;
            const current = s === step;
            const reachable = !locked && (done || canReach(s));
            return (
              <li key={s} className="flex items-center gap-1">
                <button
                  disabled={!reachable || current}
                  onClick={() => setStep(s)}
                  className={cx(
                    'flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm',
                    current ? 'bg-brand-700 font-medium text-white' : done ? 'text-brand-800 hover:bg-brand-50' : reachable ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400'
                  )}
                  aria-current={current ? 'step' : undefined}
                >
                  <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-xs', current ? 'bg-white/20' : done ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600')}>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {STEP_LABELS[s]}
                </button>
                {i < steps.length - 1 && <span className="hidden h-px w-3 bg-slate-300 sm:block" />}
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 'design' && (
        <StepDesign
          {...props}
          onChoose={(t, preset) => {
            if (w.template?.id !== t.id || w.template?.versionId !== t.versionId || preset) {
              chooseTemplate(t, preset ? { content: preset.content, preset } : undefined);
            }
          }}
        />
      )}
      {step === 'data' && <StepData {...props} />}
      {step === 'generate' && w.renderer && (
        <div className="space-y-8">
          {!w.generatedBatchId && <StepPreview {...props} />}
          <StepGenerate
            {...props}
            onNewBatch={() => {
              set({ data: null, excluded: new Set(), overflow: new Map(), overflowChecked: false, generatedBatchId: null, confirmSkipErrors: false, batchName: '', crops: {}, editingFrom: null, focusRow: null });
              setStep('data');
            }}
          />
        </div>
      )}

      {/* Footer navigation */}
      {!locked && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button icon={<ArrowLeft className="h-4 w-4" />} disabled={idx === 0} onClick={() => setStep(steps[idx - 1])}>
            Back
          </Button>
          <div className="flex items-center gap-3">
            {blockers[step] && step !== 'generate' && <p className="hidden text-sm text-slate-600 md:block">{blockers[step]}</p>}
            {step !== 'generate' && (
              <Button variant="primary" disabled={!!blockers[step]} onClick={next}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
      {w.rendererError && step !== 'design' && (
        <Alert tone="error" className="mt-4" title="The template could not be loaded">
          {w.rendererError}
        </Alert>
      )}
    </>
  );
}
