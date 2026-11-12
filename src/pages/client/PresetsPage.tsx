import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, MoreHorizontal, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { Button, Card, EmptyState, Field, IconButton, Input, Menu, Modal, PageHeader, Spinner, useConfirm } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { ContentPreset } from '../../../shared/types';
import { formatDateOnly } from '../../lib/format';

export default function PresetsPage() {
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [presets, setPresets] = useState<ContentPreset[] | null>(null);
  const [renaming, setRenaming] = useState<ContentPreset | null>(null);

  const load = useCallback(() => {
    api
      .get<ContentPreset[]>('/api/client/presets')
      .then(setPresets)
      .catch((e) => showToast(e.message, 'error'));
  }, [showToast]);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, ContentPreset[]>();
    for (const p of presets || []) {
      const k = p.templateTitle || 'Template';
      m.set(k, [...(m.get(k) || []), p]);
    }
    return [...m.entries()];
  }, [presets]);

  return (
    <>
      <PageHeader title="Content presets" description="Saved wording you can reuse with the same template. Editing a preset never changes certificates you already generated." />
      {!presets ? (
        <Spinner />
      ) : presets.length === 0 ? (
        <EmptyState icon={<BookmarkCheck className="h-6 w-6" />} title="No presets yet" description="While writing wording for a batch, choose “Save as preset” to reuse it later." />
      ) : (
        <div className="space-y-6">
          {groups.map(([title, list]) => (
            <section key={title}>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
              <Card>
                <ul className="divide-y divide-slate-100">
                  {list.map((p) => {
                    const firstText = Object.values(p.content.texts).find((t) => t.trim()) || '';
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{p.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {firstText ? `“${firstText.slice(0, 120)}”` : 'No wording'} · updated {formatDateOnly(p.updatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="subtle" icon={<PlayCircle className="h-4 w-4" />} onClick={() => navigate(`/app/new?preset=${p.id}`)}>
                            Use
                          </Button>
                          <Menu
                            trigger={(t) => (
                              <IconButton label={`Actions for ${p.name}`} onClick={t}>
                                <MoreHorizontal className="h-4 w-4" />
                              </IconButton>
                            )}
                            items={[
                              { label: 'Rename', icon: <Pencil className="h-4 w-4" />, onClick: () => setRenaming(p) },
                              {
                                label: 'Delete',
                                icon: <Trash2 className="h-4 w-4" />,
                                danger: true,
                                onClick: async () => {
                                  if (!(await confirm({ title: `Delete “${p.name}”?`, message: 'Past certificates are not affected.', confirmLabel: 'Delete', danger: true }))) return;
                                  try {
                                    await api.del(`/api/client/presets/${p.id}`);
                                    load();
                                  } catch (e: any) {
                                    showToast(e.message, 'error');
                                  }
                                },
                              },
                            ]}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
          <p className="text-sm text-slate-500">To change a preset's wording, choose Use, edit the wording, then select “Update preset”.</p>
        </div>
      )}
      {renaming && <RenameModal preset={renaming} onClose={() => setRenaming(null)} onSaved={load} />}
    </>
  );
}

function RenameModal({ preset, onClose, onSaved }: { preset: ContentPreset; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(preset.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Rename preset"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.put(`/api/client/presets/${preset.id}`, { name });
                onSaved();
                onClose();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label="Name" error={error}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </Field>
    </Modal>
  );
}
