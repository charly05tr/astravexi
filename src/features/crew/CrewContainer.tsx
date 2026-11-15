import { useCallback, useMemo } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import type { Tier, ZoneId } from '../../core/health/model';
import type { CrewMember, CrewReview } from '../../core/use-cases/crew';
import { tierTheme } from '../../theme/tiers';
import { useCoalescedLoad } from '../shared/use-coalesced-load';
import { MedicalRecordContainer } from '../medical/MedicalRecordContainer';
import { MedicationStockContainer } from '../medical/MedicationStockContainer';
import { CrewMemberDetail } from './CrewMemberDetail';
import { CrewOverview } from './CrewOverview';
import { buildCrewDetail, buildCrewOverview } from './crew-model';

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
  const [loaded, setLoaded] = useCoalescedLoad(() => store.getState().loadCrew(), session);
  const load: { status: 'loading' } | { status: 'error' } | { status: 'ready'; review: CrewReview } =
    loaded.status === 'ready' ? { status: 'ready', review: loaded.value } : loaded;
  const review = load.status === 'ready' ? load.review : null;
  const cards = useMemo(() => (review ? buildCrewOverview(review.members, knowledge, tierLabel) : []), [review, knowledge]);
  const member = review?.members.find((m) => m.profileId === crewMemberId) ?? null;
  const detail = useMemo(() => (member ? buildCrewDetail(member, knowledge, tierLabel) : null), [member, knowledge]);

  const acknowledge = useCallback(
    async (zoneId: ZoneId, groupId: string) => {
      if (!crewMemberId) return;
      const updated = await store.getState().acknowledgeCrewMember(crewMemberId, zoneId, groupId);
      if (!updated) return;
      setLoaded((prev) => (prev.status === 'ready' ? { status: 'ready', value: replaceMember(prev.value, updated) } : prev));
    },
    [store, crewMemberId, setLoaded],
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
      <MedicationStockContainer />
    </CrewOverview>
  );
}
