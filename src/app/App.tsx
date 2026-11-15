import type { BootResult } from './boot';
import { ProfileFlow } from './ProfileFlow';
import { ModeChoice } from '../features/onboarding/ModeChoice';

export function App({ boot }: { boot: BootResult }) {
  if (boot.kind === 'choose') return <ModeChoice onChoose={boot.choose} />;
  return <ProfileFlow session={boot.session} />;
}
