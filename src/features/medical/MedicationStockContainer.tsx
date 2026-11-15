import { useCallback, useEffect, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { can } from '../../core/profiles/policy';
import type { Medication, MedicationErrors, MedicationInput } from '../../core/medical/model';
import type { MedicalStockView } from '../../core/use-cases/medical';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { MedicationDialog } from './MedicationDialog';
import { MedicationStockPanel } from './MedicationStockPanel';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: MedicalStockView };
type Editing = { medication: Medication | null } | null;

/**
 * The medication stock of the CMO dashboard. Renders nothing for any other role; the use-cases refuse them
 * again, so this check only keeps the UI honest.
 */
export function MedicationStockContainer() {
  const role = useAppState((s) => s.actor.role);
  return can(role, 'manageMedicalStock') ? <MedicationStock /> : null;
}

function MedicationStock() {
  const { store } = useAppContext();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Medication | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoad({ status: 'ready', view: await store.getState().loadMedicalStock() });
    } catch {
      setLoad({ status: 'error' });
    }
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    store
      .getState()
      .loadMedicalStock()
      .then((view) => {
        if (!cancelled) setLoad({ status: 'ready', view });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const save = async (input: MedicationInput): Promise<MedicationErrors | null> => {
    const result = await store.getState().saveMedication(input, editing?.medication?.id);
    if (!result.ok) return result.errors;
    setEditing(null);
    await reload();
    return null;
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await store.getState().deleteMedication(deleting.id);
      setDeleting(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (load.status === 'loading') {
    return (
      <p className="muted" role="status" aria-busy="true">
        Loading medication stock.
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <p className="banner" role="alert">
        The medication stock could not be loaded from this device.
      </p>
    );
  }
  return (
    <>
      <MedicationStockPanel
        medications={load.view.medications}
        summary={load.view.summary}
        today={load.view.today}
        actions={{ onAdd: () => setEditing({ medication: null }), onEdit: (m) => setEditing({ medication: m }), onDelete: setDeleting }}
      />
      {editing ? <MedicationDialog medication={editing.medication} onSubmit={save} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog title="Delete medication" confirmLabel="Delete" busy={busy} onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)}>
          <p>
            Remove <strong>{deleting.name}</strong> from the kit? Past administrations keep its name.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
