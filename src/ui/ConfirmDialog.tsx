import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** An in-app confirmation for a destructive action. Esc, the close button and Cancel all decline. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <Dialog title={title} closeLabel="Close confirmation" onClose={onCancel} style={{ width: 'min(440px, 92vw)' }}>
      <div className="stack">
        <div>{children}</div>
        <div className="proposal__actions">
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
