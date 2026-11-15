import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import type { Tier, ZoneId } from '../../core/health/model';
import type { CrewMember, CrewReview } from '../../core/use-cases/crew';
import { tierTheme } from '../../theme/tiers';
import { CabinCo2Container } from '../environment/CabinCo2Container';
import { MedicalRecordContainer } from '../medical/MedicalRecordContainer';
import { MedicationStockContainer } from '../medical/MedicationStockContainer';
import { CrewMemberDetail } from './CrewMemberDetail';
import { CrewOverview } from './CrewOverview';
import { buildCrewDetail, buildCrewOverview } from './crew-model';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; review: CrewReview };

const tierLabel = (t: Tier) => tierTheme(t).label;

function replaceMember(review: CrewReview, updated: CrewMember): CrewReview {
  return { ...review, members: review.members.map((m) => (m.profileId === updated.profileId ? updated : m)) };
}

/** The crew dashboard of the CMO and the flight surgeon: the overview, and one member's detail. */
export function CrewContainer() {
  const { knowledge, store } = useAppContext();
  // A new session (sync pull, day rollover, check-in) means the crew's records may have changed too.
  const session = useAppState((s) => s.session);
  const { crewMemberId, selectCrewMember } = useUi();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    store
      .getState()
      .loadCrew()
      .then((review) => {
        if (!cancelled) setLoad({ status: 'ready', review });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [store, session]);

  const review = load.status === 'ready' ? load.review : null;
  const cards = useMemo(() => (review ? buildCrewOverview(review.members, knowledge, tierLabel) : []), [review, knowledge]);
  const member = review?.members.find((m) => m.profileId === crewMemberId) ?? null;
  const detail = useMemo(() => (member ? buildCrewDetail(member, knowledge, tierLabel) : null), [member, knowledge]);

  const acknowledge = useCallback(
    async (zoneId: ZoneId, groupId: string) => {
      if (!crewMemberId) return;
      const updated = await store.getState().acknowledgeCrewMember(crewMemberId, zoneId, groupId);
      if (!updated) return;
      setLoad((prev) => (prev.status === 'ready' ? { status: 'ready', review: replaceMember(prev.review, updated) } : prev));
    },
    [store, crewMemberId],
  );

  if (load.status === 'loading') {
    return (
      <p className="muted" role="status" aria-busy="true">
        Loading crew.
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <p className="banner" role="alert">
        The crew could not be loaded from this device.
      </p>
    );
  }
  if (detail) {
    return (
      <CrewMemberDetail
        detail={detail}
        onBack={() => selectCrewMember(null)}
        onAcknowledge={(z, g) => void acknowledge(z, g)}
        medical={<MedicalRecordContainer profileId={detail.card.profileId} />}
      />
    );
  }
  return (
    <CrewOverview cards={cards} unavailable={load.review.unavailable.map((u) => u.name)} onOpen={selectCrewMember}>
      <CabinCo2Container />
      <MedicationStockContainer />
    </CrewOverview>
  );
}
