import type { BootResult } from './boot';
import { AppRoot } from './AppRoot';
import { ModeChoice } from '../features/onboarding/ModeChoice';

export function App({ boot }: { boot: BootResult }) {
  if (boot.kind === 'choose') return <ModeChoice onChoose={boot.choose} />;
  return <AppRoot store={boot.store} />;
}
