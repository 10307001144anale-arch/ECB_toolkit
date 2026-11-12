import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button, Modal, Segmented, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { PublicUser, TemplateDetail } from '../../../shared/types';

/** Chooses which clients can use a template. */
export function AccessModal({ templateId, title, onClose, onSaved }: { templateId: string; title: string; onClose: () => void; onSaved?: () => void }) {
  const { showToast } = useToast();
  const [clients, setClients] = useState<PublicUser[] | null>(null);
  const [visibility, setVisibility] = useState<'all' | 'assigned'>('assigned');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.get<PublicUser[]>('/api/admin/clients'), api.get<TemplateDetail>(`/api/admin/templates/${templateId}`)])
      .then(([c, t]) => {
        setClients(c);
        setVisibility(t.visibility);
        setSelected(new Set(t.assignedClientIds));
      })
      .catch((e) => showToast(e.message, 'error'));
  }, [templateId, showToast]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/api/admin/templates/${templateId}/access`, { visibility, clientIds: [...selected] });
      showToast('Access updated', 'success');
      onSaved?.();
      onClose();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Client access"
      description={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Save access
          </Button>
        </>
      }
    >
      {!clients ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Segmented
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'assigned', label: 'Selected clients' },
              { value: 'all', label: 'All clients' },
            ]}
          />
          <p className="text-sm text-slate-500">Only published templates are shown to clients.</p>
          {visibility === 'assigned' &&
            (clients.length === 0 ? (
              <p className="text-sm text-slate-500">There are no client accounts yet. Create them on the Clients page.</p>
            ) : (
              <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {clients.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        if (e.target.checked) s.add(c.id);
                        else s.delete(c.id);
                        setSelected(s);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{c.name}</span>
                      <span className="block truncate text-xs text-slate-500">{c.organisation || c.email}</span>
                    </span>
                    {!c.active && <span className="text-xs text-slate-400">Inactive</span>}
                  </label>
                ))}
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}
