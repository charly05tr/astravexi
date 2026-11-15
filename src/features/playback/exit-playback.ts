import type { PlaybackController } from '../../app/playback/playback-controller';

/** Same target as "Back to the default demo" in the Load scenario dialog: no scenario or seed parameters are left behind. */
export const DEFAULT_DEMO_URL = '?mode=demo';
/** Read once by the default demo after the reload, to put focus on the page content instead of losing it. */
export const EXITED_FLAG = 'astravexi.playback.exited';

type Navigate = (url: string) => void;
let navigate: Navigate = (url) => window.location.assign(url);

/** Tests replace the page navigation (jsdom cannot navigate). */
export function setExitNavigator(fn: Navigate | null): void {
  navigate = fn ?? ((url) => window.location.assign(url));
}

/**
 * Leaves the scenario: stops the playback (no timer keeps running), then loads the default demo. A scenario lives in memory
 * only (see composeAdapters: its record stores are memory stores), so nothing persisted needs cleaning up.
 */
export function exitPlayback(playback: PlaybackController): void {
  playback.pause();
  playback.dispose();
  try {
    sessionStorage.setItem(EXITED_FLAG, '1');
  } catch {
    // Focus then starts at the top of the page.
  }
  navigate(DEFAULT_DEMO_URL);
}
