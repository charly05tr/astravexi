import { Users } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useAppState } from '../../app/app-context';
import { useProfileContext } from '../../app/profile-context';
import { useSyncService } from '../../app/sync/sync-context';
import { ROLES, toActor } from '../../core/profiles/model';
import type { Actor, CrewProfile, Role } from '../../core/profiles/model';
import { can, policyContextOf } from '../../core/profiles/policy';
import { MAX_NAME_LENGTH, deleteProfile, updateProfile } from '../../core/use-cases/profiles';
import type { ProfileResult } from '../../core/use-cases/profiles';
import { Button } from '../../ui/Button';
import { EmptyState, Panel } from '../../ui/Panel';
import { ProfileForm } from './ProfileForm';
import { ROLE_LABEL } from './role-labels';

function ProfileRow({
  profile,
  isSelf,
  onChange,
  onRemove,
}: {
  profile: CrewProfile;
  isSelf: boolean;
  onChange(patch: { name?: string; role?: Role; pin?: null }): Promise<void>;
  onRemove(): Promise<void>;
}) {
  const uid = useId();
  // The parent keys the row by name, so a rename from outside remounts it with the new value.
  const [name, setName] = useState(profile.name);
  const dirty = name.trim() !== profile.name;

  return (
    <li className="item" data-profile-id={profile.id}>
      <div className="item__head">
        <strong>
          {profile.name}
          {isSelf ? ' (you)' : ''}
        </strong>
        <span className="muted small">{profile.pin ? 'PIN set' : 'No PIN'}</span>
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label" htmlFor={`${uid}-name`}>
            Name
          </label>
          <input
            id={`${uid}-name`}
            className="input"
            type="text"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${uid}-role`}>
            Role
          </label>
          <select
            id={`${uid}-role`}
            className="input"
            value={profile.role}
            onChange={(e) => void onChange({ role: e.target.value as Role })}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="proposal__actions">
        <Button size="small" variant="primary" disabled={!dirty} onClick={() => void onChange({ name })}>
          Save name
        </Button>
        {profile.pin ? (
          <Button size="small" onClick={() => void onChange({ pin: null })}>
            Remove PIN
          </Button>
        ) : null}
        <Button size="small" aria-label={`Delete ${profile.name}`} disabled={isSelf} onClick={() => void onRemove()}>
          Delete
        </Button>
      </div>
    </li>
  );
}

/** Profile management for a CMO: list, create, rename, change role, set or remove a PIN, soft delete. */
export function ProfilesView() {
  const ctx = useProfileContext();
  const sync = useSyncService();
  const actor = useAppState((s) => s.actor);
  const [profiles, setProfiles] = useState<CrewProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const reload = async () => setVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    void ctx?.services.profiles.list().then((list) => {
      if (!cancelled) setProfiles(list);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx, version]);

  if (!ctx) return null;
  if (!can(actor.role, 'manageProfiles', profiles ? policyContextOf(profiles) : {})) {
    return (
      <Panel id="profiles" title="Profiles" icon={<Users size={20} aria-hidden="true" />}>
        <EmptyState>Only a Crew Medical Officer can manage profiles.</EmptyState>
      </Panel>
    );
  }

  const { services, active, onActiveChanged } = ctx;
  const run = async (action: () => Promise<ProfileResult | { ok: true } | { ok: false; error: string }>) => {
    try {
      const result = await action();
      setError(result.ok ? null : result.error);
      if (result.ok && 'profile' in result && result.profile.id === active.id) onActiveChanged(result.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    sync?.notifyLocalChange(); // a profile may have changed: push it soon
    await reload();
  };
  const as: Actor = toActor(active);

  return (
    <div className="stack">
      <Panel
        id="profiles"
        title="Profiles"
        icon={<Users size={20} aria-hidden="true" />}
        hint="People who use this device. Each profile keeps its own data. Roles decide who can check in, decide on suggestions and acknowledge warnings."
      >
        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}
        {profiles === null ? (
          <p className="muted" role="status">
            Loading.
          </p>
        ) : profiles.length === 0 ? (
          <EmptyState>No profiles.</EmptyState>
        ) : (
          <ul className="item-list">
            {profiles.map((p) => (
              <ProfileRow
                key={`${p.id}:${p.name}`}
                profile={p}
                isSelf={p.id === active.id}
                onChange={(patch) => run(() => updateProfile(services.deps, as, p.id, patch))}
                onRemove={() => run(() => deleteProfile(services.deps, as, p.id))}
              />
            ))}
          </ul>
        )}
      </Panel>
      <ProfileForm
        label="New profile"
        submitLabel="Add profile"
        onSubmit={async (values) => {
          try {
            const result = await services.create(as, { name: values.name, role: values.role, pin: values.pin });
            if (result.ok) {
              sync?.notifyLocalChange();
              await reload();
            }
            return result.ok ? null : result.error;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        }}
      />
    </div>
  );
}
