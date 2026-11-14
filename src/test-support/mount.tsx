import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRoot } from '../app/AppRoot';
import type { AppMode } from '../app/mode';
import { BrandProvider } from '../brand/brand-context';
import { brand } from '../brand/brand.config';
import type { BrandConfig } from '../brand/brand.types';
import { createTestWorld } from './compose';

/**
 * Builds a hydrated app in memory and renders the real UI on it. The store is already hydrated, so the
 * root does not start its ticker; tests advance the link with `store.getState().tick()`.
 */
export async function mountApp(
  mode: AppMode,
  options: { brandConfig?: BrandConfig; configureLive?: boolean } = {},
) {
  const world = createTestWorld();
  const app = await world.app(mode);
  if (mode === 'live' && options.configureLive !== false) {
    await app.state().saveMissionConfig({ launchDate: '2026-06-15', transitDays: 210, destination: 'Mars' });
  }
  const user = userEvent.setup();
  const view = render(
    <BrandProvider value={options.brandConfig ?? brand}>
      <AppRoot store={app.store} autoStart={false} />
    </BrandProvider>,
  );
  return { world, app, store: app.store, state: app.state, user, ...view };
}
