import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ROLES } from '../../core/profiles/model';
import type { Role } from '../../core/profiles/model';
import { MAX_NAME_LENGTH } from '../../core/use-cases/profiles';
import { Button } from '../../ui/Button';
import { ROLE_HINT, ROLE_LABEL } from './role-labels';

export interface ProfileFormValues {
  name: string;
  role: Role;
  pin: string;
}

/**
 * Name, role and an optional PIN. Presentational: `onSubmit` returns an error message to show, or null on
 * success. The PIN copy is deliberate: it separates profiles on a shared device, it is not security.
 */
export function ProfileForm({
  label,
  submitLabel,
  roles = ROLES,
  defaultRole = 'astronaut',
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  /** The roles that can be picked. A single role hides the picker. */
  roles?: readonly Role[];
  defaultRole?: Role;
  onSubmit(values: ProfileFormValues): Promise<string | null>;
  onCancel?(): void;
}) {
  const uid = useId();
  const [values, setValues] = useState<ProfileFormValues>({ name: '', role: defaultRole, pin: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ProfileFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const message = await onSubmit(values);
    setBusy(false);
    setError(message);
    if (message === null) setValues({ name: '', role: defaultRole, pin: '' });
  };

  return (
    <form className="panel form" onSubmit={(e) => void submit(e)} noValidate aria-label={label}>
      <div className="field">
        <label className="field__label" htmlFor={`${uid}-name`}>
          Name
        </label>
        <input
          id={`${uid}-name`}
          className="input"
          type="text"
          autoComplete="off"
          maxLength={MAX_NAME_LENGTH}
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>
      {roles.length > 1 ? (
        <div className="field">
          <label className="field__label" htmlFor={`${uid}-role`}>
            Role
          </label>
          <select
            id={`${uid}-role`}
            className="input"
            value={values.role}
            onChange={(e) => set({ role: e.target.value as Role })}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <p className="field__hint">{ROLE_HINT[values.role]}</p>
        </div>
      ) : (
        <p className="field__hint">
          Role: <strong>{ROLE_LABEL[values.role]}</strong>
        </p>
      )}
      <div className="field">
        <label className="field__label" htmlFor={`${uid}-pin`}>
          PIN <span className="muted">(optional, 4 to 8 digits)</span>
        </label>
        <input
          id={`${uid}-pin`}
          className="input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={values.pin}
          onChange={(e) => set({ pin: e.target.value })}
        />
        <p className="field__hint">
          A PIN keeps profiles apart on a shared device. It does not encrypt your data and is not a security feature.
        </p>
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="proposal__actions">
        <Button type="submit" variant="primary" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}
