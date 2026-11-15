import { useCallback, useEffect, useState } from 'react';
import { toActor } from '../core/profiles/model';
import type { CrewProfile } from '../core/profiles/model';
import { ProfileGate } from '../features/profiles/ProfileGate';
import { AppRoot } from './AppRoot';
import type { ProfileSession } from './boot';
import { ProfileProvider } from './profile-context';
import type { AppStore } from './store/app-store';

type Phase = { kind: 'resolving' } | { kind: 'gate'; preselect: string | null } | { kind: 'in'; profile: CrewProfile; store: AppStore };

const defaultSwitch = () => window.location.reload();

/**
 * Sits between boot and the app. Picks the profile (gate), then builds that profile's app store. A remembered
 * profile without a PIN goes straight in; one with a PIN comes back through the gate.
 */
export function ProfileFlow({
  session,
  reload = defaultSwitch,
}: {
  session: ProfileSession;
  /** Called after the active profile is cleared; the real app reloads the page. */
  reload?: () => void;
}) {
  const { services } = session;
  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' });

  const enter = useCallback(
    async (profile: CrewProfile) => {
      services.activeProfile.set(profile.id);
      const store = await session.enter(profile);
      setPhase({ kind: 'in', profile, store });
    },
    [services, session],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remembered = services.activeProfile.get();
      const profile = remembered ? await services.profiles.get(remembered) : undefined;
      if (cancelled) return;
      if (profile && !profile.deleted && !profile.pin) await enter(profile);
      else setPhase({ kind: 'gate', preselect: profile && !profile.deleted ? profile.id : null });
    })();
    return () => {
      cancelled = true;
    };
  }, [services, enter]);

  if (phase.kind === 'resolving') {
    return (
      <main className="center-stage" id="main" aria-busy="true">
        <p className="muted" role="status">
          Loading.
        </p>
      </main>
    );
  }
  if (phase.kind === 'gate') {
    return <ProfileGate services={services} preselect={phase.preselect} onEnter={enter} />;
  }

  const { profile, store } = phase;
  return (
    <ProfileProvider
      value={{
        services,
        active: profile,
        onActiveChanged(next) {
          store.getState().setActor(toActor(next));
          setPhase({ kind: 'in', profile: next, store });
        },
        switchProfile(profileId) {
          if (profileId) services.activeProfile.set(profileId);
          else services.activeProfile.clear();
          reload();
        },
      }}
    >
      <AppRoot store={store} />
    </ProfileProvider>
  );
}
