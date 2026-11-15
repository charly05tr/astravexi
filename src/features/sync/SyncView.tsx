import { RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useAppState } from '../../app/app-context';
import { useSyncService, useSyncStatus } from '../../app/sync/sync-context';
import type { SyncStatus } from '../../app/sync/sync-service';
import { can } from '../../core/profiles/policy';
import { MAX_DEVICE_NAME_LENGTH } from '../../core/sync/enroll';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { EmptyState, Panel } from '../../ui/Panel';
import { summarize, timeAgo } from './sync-summary';
import { useNow } from './use-now';

const TITLE = 'Mission control sync';

function SecureNote() {
  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
  return (
    <>
      <p className="field__hint">
        Sync needs a secure connection: open the app over HTTPS (or on localhost) and point it at an HTTPS server. The
        device token travels in a header and must never cross plain HTTP.
      </p>
      {insecure ? (
        <p className="field__error" role="alert">
          This page is not in a secure context. Enrollment will not work until it is served over HTTPS.
        </p>
      ) : null}
    </>
  );
}

function EnrollForm({ disconnected }: { disconnected: boolean }) {
  const service = useSyncService()!;
  const uid = useId();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await service.enroll({ code, name });
    setBusy(false);
    if (result.ok) {
      setCode('');
      setName('');
    } else {
      setError(result.error);
    }
  };

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate aria-label="Enroll this device">
      {disconnected ? (
        <p className="banner" role="alert">
          This device was disconnected from mission control. Enroll again with a new code to resume syncing.
        </p>
      ) : (
        <p className="muted">
          This device is not connected. Ask the mission control admin for a single-use enrollment code, valid for a
          limited time.
        </p>
      )}
      <div className="field">
        <label className="field__label" htmlFor={`${uid}-code`}>
          Enrollment code
        </label>
        <input
          id={`${uid}-code`}
          className="input"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={code}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${uid}-name`}>
          Device name
        </label>
        <input
          id={`${uid}-name`}
          className="input"
          type="text"
          autoComplete="off"
          maxLength={MAX_DEVICE_NAME_LENGTH}
          placeholder="CMO laptop"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="field__hint">Shown to the mission control admin, so they can tell devices apart.</p>
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="proposal__actions">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Enrolling...' : 'Enroll device'}
        </Button>
      </div>
    </form>
  );
}

function Enrolled({ status }: { status: SyncStatus }) {
  const service = useSyncService()!;
  const [confirming, setConfirming] = useState(false);
  const now = useNow();
  const summary = summarize(status, now);
  const rejected = status.issues.find((i) => i.kind === 'rejected_future');
  const forbidden = status.issues.find((i) => i.kind === 'forbidden');

  return (
    <div className="stack">
      <dl className="sync-facts">
        <div>
          <dt className="muted small">Device</dt>
          <dd>{status.deviceName}</dd>
        </div>
        <div>
          <dt className="muted small">Last sync</dt>
          <dd>{status.lastSyncAt ? timeAgo(status.lastSyncAt, now) : 'Never'}</dd>
        </div>
        <div>
          <dt className="muted small">Status</dt>
          <dd role="status">{summary?.label}</dd>
        </div>
      </dl>
      {status.error ? (
        <p className="field__error" role="alert">
          Last attempt failed: {status.error.message}
        </p>
      ) : null}
      {rejected ? (
        <p className="field__error" role="alert">
          The clock of this device is ahead of the server, so {rejected.count} item{rejected.count === 1 ? ' was' : 's were'}{' '}
          not accepted. Fix the date and time of this device; they are sent again automatically.
        </p>
      ) : null}
      {forbidden ? (
        <p className="field__error" role="alert">
          The server refused {forbidden.count} item{forbidden.count === 1 ? '' : 's'} that belong to another device.
        </p>
      ) : null}
      <div className="proposal__actions">
        <Button variant="primary" disabled={status.syncing} onClick={() => void service.syncNow()}>
          Sync now
        </Button>
        <Button onClick={() => setConfirming(true)}>Disconnect</Button>
      </div>
      {confirming ? (
        <Dialog
          title="Disconnect this device?"
          closeLabel="Cancel disconnect"
          onClose={() => setConfirming(false)}
          style={{ width: 'min(480px, 92vw)' }}
        >
          <div className="stack">
            <p>Data stays on this device, but it stops syncing until you enroll again with a new code.</p>
            <div className="proposal__actions">
              <Button
                variant="primary"
                onClick={() => {
                  setConfirming(false);
                  void service.disconnect();
                }}
              >
                Yes, disconnect
              </Button>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

/** Enrollment and status of the device's sync with mission control. CMO only, and only when a backend is configured. */
export function SyncView() {
  const role = useAppState((s) => s.actor.role);
  const service = useSyncService();
  const status = useSyncStatus();
  const icon = <RefreshCw size={20} aria-hidden="true" />;

  if (!service || !status) {
    return (
      <Panel id="sync" title={TITLE} icon={icon}>
        <EmptyState>Sync is not available in this build.</EmptyState>
      </Panel>
    );
  }
  if (!can(role, 'manageProfiles')) {
    return (
      <Panel id="sync" title={TITLE} icon={icon}>
        <EmptyState>Only a Crew Medical Officer can manage sync.</EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      id="sync"
      title={TITLE}
      icon={icon}
      hint="Keeps a copy of this device's profiles and records on the mission control server. This device stays the source of truth and works fully offline."
    >
      {!status.ready ? (
        <p className="muted" role="status">
          Loading.
        </p>
      ) : status.enrolled ? (
        <Enrolled status={status} />
      ) : (
        <EnrollForm disconnected={status.error?.code === 'disconnected'} />
      )}
      <SecureNote />
    </Panel>
  );
}
