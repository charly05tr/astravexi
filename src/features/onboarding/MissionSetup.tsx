import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAppActions } from '../../app/app-context';
import { useBrand } from '../../brand/brand-context';
import { Button } from '../../ui/Button';

const DEFAULT_TRANSIT_DAYS = 210;
const DEFAULT_DESTINATION = 'Mars';
const MAX_TRANSIT_DAYS = 2000;

/** Today as `YYYY-MM-DD` in the local time zone. */
function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface MissionSetupValues {
  launchDate: string;
  transitDays: string;
  destination: string;
}

/** Validates the setup form. Returns an error per field, or null when it is valid. */
export function validateMissionSetup(v: MissionSetupValues): Partial<Record<keyof MissionSetupValues, string>> | null {
  const errors: Partial<Record<keyof MissionSetupValues, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.launchDate)) errors.launchDate = 'Enter the launch date.';
  const days = Number(v.transitDays);
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRANSIT_DAYS) {
    errors.transitDays = `Enter a whole number of days from 1 to ${MAX_TRANSIT_DAYS}.`;
  }
  if (v.destination.trim() === '') errors.destination = 'Enter a destination.';
  return Object.keys(errors).length > 0 ? errors : null;
}

/** LIVE first run: launch date, transit length and destination, with defaults. One step. */
export function MissionSetup() {
  const brand = useBrand();
  const actions = useAppActions();
  const [values, setValues] = useState<MissionSetupValues>(() => ({
    launchDate: todayLocalDate(),
    transitDays: String(DEFAULT_TRANSIT_DAYS),
    destination: DEFAULT_DESTINATION,
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof MissionSetupValues, string>>>({});
  const set = (patch: Partial<MissionSetupValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateMissionSetup(values);
    setErrors(found ?? {});
    if (found) return;
    void actions.saveMissionConfig({
      launchDate: values.launchDate,
      transitDays: Number(values.transitDays),
      destination: values.destination.trim(),
    });
  };

  return (
    <main className="center-stage" id="main">
      <header className="stack" style={{ gap: 8 }}>
        <h1>Set up your mission</h1>
        <p className="muted">
          {brand.productName} counts the mission day from the launch date. You can start with the defaults.
        </p>
      </header>
      <form className="panel form" onSubmit={submit} noValidate aria-label="Mission setup">
        <div className="field">
          <label className="field__label" htmlFor="ms-launch">
            Launch date
          </label>
          <input
            id="ms-launch"
            className="input"
            type="date"
            value={values.launchDate}
            aria-invalid={errors.launchDate ? true : undefined}
            onChange={(e) => set({ launchDate: e.target.value })}
          />
          {errors.launchDate ? (
            <p className="field__error" role="alert">
              {errors.launchDate}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ms-days">
            Transit length <span className="muted">(days)</span>
          </label>
          <input
            id="ms-days"
            className="input"
            type="text"
            inputMode="numeric"
            value={values.transitDays}
            aria-invalid={errors.transitDays ? true : undefined}
            onChange={(e) => set({ transitDays: e.target.value })}
          />
          {errors.transitDays ? (
            <p className="field__error" role="alert">
              {errors.transitDays}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ms-destination">
            Destination
          </label>
          <input
            id="ms-destination"
            className="input"
            type="text"
            value={values.destination}
            aria-invalid={errors.destination ? true : undefined}
            onChange={(e) => set({ destination: e.target.value })}
          />
          {errors.destination ? (
            <p className="field__error" role="alert">
              {errors.destination}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="primary">
          Start mission
        </Button>
      </form>
      <p className="muted">Decision support, not medical advice.</p>
    </main>
  );
}
