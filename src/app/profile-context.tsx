import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { CrewProfile } from '../core/profiles/model';
import type { ProfileServices } from './composition-root';

export interface ProfileContextValue {
  services: ProfileServices;
  /** The signed-in profile. */
  active: CrewProfile;
  /** The signed-in profile was renamed or got another role: the app picks up the new actor. */
  onActiveChanged(profile: CrewProfile): void;
  /** Back to the profile gate, or straight to `profileId` (a PIN-protected one still asks for its PIN). */
  switchProfile(profileId?: string): void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ value, children }: { value: ProfileContextValue; children: ReactNode }) {
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/** Null when the app is rendered without profile services (some tests); the profile UI then stays out. */
export function useProfileContext(): ProfileContextValue | null {
  return useContext(ProfileContext);
}
