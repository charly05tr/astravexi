import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRoot } from '../app/AppRoot';
import type { DemoScenario } from '../app/demo/demo-scenario';
import type { PlaybackOptions } from '../app/playback/playback-controller';
import type { AiModelCatalog, AiSettingsStore, CabinReferenceSource, FollowUpSuggestionProvider } from '../core/ports';
import type { AppMode } from '../app/mode';
import { ProfileProvider } from '../app/profile-context';
import { SyncProvider } from '../app/sync/sync-context';
import type { SyncService } from '../app/sync/sync-service';
import { BrandProvider } from '../brand/brand-context';
import { brand } from '../brand/brand.config';
import type { BrandConfig } from '../brand/brand.types';
import { toActor } from '../core/profiles/model';
import type { CrewProfile, Role } from '../core/profiles/model';
import { createTestWorld } from './compose';

/**
 * Builds a hydrated app in memory and renders the real UI on it. The store is already hydrated, so the
 * root does not start its ticker; tests advance the link with `store.getState().tick()`.
 * The signed-in profile is an astronaut unless `role` says otherwise.
 */
export async function mountApp(
  mode: AppMode,
  options: {
    brandConfig?: BrandConfig;
    configureLive?: boolean;
    role?: Role;
    sync?: SyncService | null;
    followUps?: FollowUpSuggestionProvider;
    aiSettings?: AiSettingsStore;
    aiModels?: AiModelCatalog;
    /** The NASA OSDR reference. Defaults to a source that fails: tests never reach the network. */
    cabinSource?: CabinReferenceSource;
    /** DEMO only: a scenario to run under playback. */
    scenario?: DemoScenario | null;
    playback?: PlaybackOptions;
  } = {},
) {
  const world = createTestWorld();
  if (options.cabinSource) world.cabin.source = options.cabinSource;
  const app = await world.app(mode, { role: options.role, scenario: options.scenario, playback: options.playback });
  if (mode === 'live' && options.configureLive !== false) {
    await app.state().saveMissionConfig({ launchDate: '2026-06-15', transitDays: 210, destination: 'Mars' });
  }
  const session = await world.profileSession(mode);
  await session.services.profiles.upsert(app.profile);
  const switches = { count: 0 };
  let active: CrewProfile = app.profile;
  const user = userEvent.setup();
  const view = render(
    <BrandProvider value={options.brandConfig ?? brand}>
      <SyncProvider service={options.sync ?? null}>
        <ProfileProvider
          value={{
            services: session.services,
            active,
            onActiveChanged(next) {
              active = next;
              app.store.getState().setActor(toActor(next));
            },
            switchProfile() {
              switches.count += 1;
            },
          }}
        >
          <AppRoot
            store={app.store}
            autoStart={false}
            followUps={options.followUps}
            aiSettings={options.aiSettings}
            aiModels={options.aiModels}
          />
        </ProfileProvider>
      </SyncProvider>
    </BrandProvider>,
  );
  /** Signs the store in as another role without remounting (the UI follows `actor`). */
  const actAs = (role: Role) => app.store.getState().setActor(toActor({ ...app.profile, role, id: `test-${role}` }));
  return { world, app, store: app.store, state: app.state, user, switches, services: session.services, actAs, ...view };
}
