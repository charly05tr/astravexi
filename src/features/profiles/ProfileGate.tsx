import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useBrand } from '../../brand/brand-context';
import type { ProfileServices } from '../../app/composition-root';
import type { CrewProfile } from '../../core/profiles/model';
import { unlockProfile } from '../../core/use-cases/profiles';
import { Button } from '../../ui/Button';
import { ProfileForm } from './ProfileForm';
import { ROLE_LABEL } from './role-labels';

type Step =
  | { kind: 'loading' }
  | { kind: 'pick'; profiles: CrewProfile[] }
  | { kind: 'pin'; profiles: CrewProfile[]; profile: CrewProfile }
  | { kind: 'create'; profiles: CrewProfile[] };

function PinPrompt({
  profile,
  verify,
  onBack,
}: {
  profile: CrewProfile;
  verify(pin: string): Promise<boolean>;
  onBack(): void;
}) {
  const id = useId();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (!(await verify(pin))) {
        setError('That PIN does not match.');
        setPin('');
      }
    } catch {
      setError('The PIN for this profile cannot be checked. Ask the crew medical officer to reset it.');
      setPin('');
    }
  };
  return (
    <form className="panel form" onSubmit={(e) => void submit(e)} noValidate aria-label={`PIN for ${profile.name}`}>
      <div className="field">
        <label className="field__label" htmlFor={id}>
          PIN for {profile.name}
        </label>
        <input
          id={id}
          className="input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setPin(e.target.value)}
        />
        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="proposal__actions">
        <Button type="submit" variant="primary">
          Unlock
        </Button>
        <Button onClick={onBack}>Back</Button>
      </div>
    </form>
  );
}

/**
 * Before the app: pick a profile (and enter its PIN if it has one), or create one. The very first run goes
 * straight to creating the first profile. The first profile is always the CMO; profiles created here
 * afterwards are astronauts, and a CMO assigns other roles in the profile manager.
 */
export function ProfileGate({
  services,
  preselect = null,
  onEnter,
}: {
  services: ProfileServices;
  /** The profile used last: when it has a PIN, its prompt opens first. */
  preselect?: string | null;
  onEnter(profile: CrewProfile): void | Promise<void>;
}) {
  const brand = useBrand();
  const [step, setStep] = useState<Step>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void services.profiles.list().then((profiles) => {
      if (cancelled) return;
      const remembered = profiles.find((p) => p.id === preselect);
      if (profiles.length === 0) setStep({ kind: 'create', profiles });
      else if (remembered?.pin) setStep({ kind: 'pin', profiles, profile: remembered });
      else setStep({ kind: 'pick', profiles });
    });
    return () => {
      cancelled = true;
    };
  }, [services, preselect]);

  const pick = (profiles: CrewProfile[], profile: CrewProfile) => {
    if (profile.pin) setStep({ kind: 'pin', profiles, profile });
    else void onEnter(profile);
  };

  const isFirst = step.kind === 'create' && step.profiles.length === 0;

  return (
    <main className="center-stage" id="main">
      <header className="stack" style={{ gap: 8 }}>
        <h1 className="onboarding__logo">
          <img src={brand.logos.full} alt={brand.productName} height={56} />
        </h1>
        {step.kind === 'pick' || step.kind === 'pin' ? <h2>Who is using {brand.productName}?</h2> : null}
        {isFirst ? (
          <>
            <h2>Create your profile</h2>
            <p className="muted">
              The first profile is the crew medical officer (CMO). The CMO then adds the astronauts and manages who
              can do what. Each person on this device gets a profile with its own data.
            </p>
          </>
        ) : null}
        {step.kind === 'create' && !isFirst ? <h2>New profile</h2> : null}
      </header>

      {!services.storageAvailable ? (
        <p className="banner" role="alert">
          Storage is unavailable in this browser. Profiles will not be kept.
        </p>
      ) : null}

      {step.kind === 'loading' ? (
        <p className="muted" role="status">
          Loading.
        </p>
      ) : null}

      {step.kind === 'pick' ? (
        <>
          <div className="choice-grid" role="group" aria-label="Profiles">
            {step.profiles.map((p) => (
              <button key={p.id} type="button" className="choice" onClick={() => pick(step.profiles, p)}>
                <span className="choice__title">{p.name}</span>
                <span className="muted">{p.pin ? `${ROLE_LABEL[p.role]}, PIN set` : ROLE_LABEL[p.role]}</span>
              </button>
            ))}
          </div>
          <div>
            <Button onClick={() => setStep({ kind: 'create', profiles: step.profiles })}>Create a profile</Button>
          </div>
        </>
      ) : null}

      {step.kind === 'pin' ? (
        <PinPrompt
          profile={step.profile}
          verify={async (pin) => {
            const ok = await unlockProfile(services.deps, step.profile, pin);
            if (ok) await onEnter(step.profile);
            return ok;
          }}
          onBack={() => setStep({ kind: 'pick', profiles: step.profiles })}
        />
      ) : null}

      {step.kind === 'create' ? (
        <ProfileForm
          label={isFirst ? 'Create your profile' : 'New profile'}
          submitLabel={isFirst ? 'Create profile and start' : 'Create profile'}
          roles={isFirst ? ['cmo'] : ['astronaut']}
          defaultRole={isFirst ? 'cmo' : 'astronaut'}
          onSubmit={async (values) => {
            const result = await services.create(null, {
              name: values.name,
              role: isFirst ? 'cmo' : 'astronaut',
              pin: values.pin,
            });
            if (!result.ok) return result.error;
            await onEnter(result.profile);
            return null;
          }}
          onCancel={isFirst ? undefined : () => setStep({ kind: 'pick', profiles: step.profiles })}
        />
      ) : null}
      <p className="muted">Decision support, not medical advice.</p>
    </main>
  );
}
