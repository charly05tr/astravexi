import { useEffect, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { can } from '../../core/profiles/policy';
import type { MedicalRecordView } from '../../core/use-cases/medical';
import { MedicalRecordPanel } from './MedicalRecordPanel';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; record: MedicalRecordView };

/** The medication and allergy record of one crew member. Renders nothing unless the actor is the CMO. */
export function MedicalRecordContainer({ profileId }: { profileId: string }) {
  const role = useAppState((s) => s.actor.role);
  return can(role, 'viewMedicalRecords') ? <MedicalRecord key={profileId} profileId={profileId} /> : null;
}

function MedicalRecord({ profileId }: { profileId: string }) {
  const { store } = useAppContext();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    store
      .getState()
      .loadMedicalRecord(profileId)
      .then((record) => {
        if (!cancelled) setLoad({ status: 'ready', record });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [store, profileId]);

  if (load.status === 'loading') {
    return (
      <p className="muted" role="status" aria-busy="true">
        Loading medical record.
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <p className="banner" role="alert">
        The medical record could not be loaded from this device.
      </p>
    );
  }
  return <MedicalRecordPanel record={load.record} />;
}
