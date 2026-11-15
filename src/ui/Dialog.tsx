import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"]), summary';

/**
 * A modal dialog rendered over the page. Focus moves into it on open, Tab stays inside, and focus returns
 * to the opener on close. Esc, the close button and a click on the backdrop close it. Esc is consumed
 * here, so page-level Esc shortcuts (leaving a focused organ) do not fire while it is open.
 */
export function Dialog({
  title,
  eyebrow,
  aside,
  onClose,
  children,
  style,
  closeLabel = 'Close',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Shown next to the title, e.g. a status chip. */
  aside?: ReactNode;
  onClose(): void;
  children: ReactNode;
  style?: CSSProperties;
  closeLabel?: string;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onKeyDown={onKeyDown}
        style={style}
      >
        <div className="dialog__head">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="dialog__actions">
            {aside}
            <button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="dialog__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
