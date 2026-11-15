import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useAppActions, useAppState } from '../../app/app-context';
import { useProfileContext } from '../../app/profile-context';
import { useSyncService, useSyncStatus } from '../../app/sync/sync-context';
import { useUi } from '../../app/ui-state';
import type { CrewProfile } from '../../core/profiles/model';
import { can, policyContextOf } from '../../core/profiles/policy';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { summarize } from '../sync/sync-summary';
import { useNow } from '../sync/use-now';
import { ROLE_LABEL } from './role-labels';

const ITEM = '[role="menuitem"]:not([disabled])';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.slice(0, 2)];
  return letters.join('').toUpperCase() || '?';
}

/**
 * The header's account button: a round avatar (with the name on wide screens) that opens a popover menu with the
 * active profile, profile switching, profile management (CMO), the DEMO actions and the LIVE/DEMO switch.
 * Esc and an outside click close it and return focus to the button; the arrow keys move between items.
 */
export function UserMenu() {
  const ctx = useProfileContext();
  const actor = useAppState((s) => s.actor);
  const mode = useAppState((s) => s.mode);
  const actions = useAppActions();
  const { setView, setAiSettingsOpen } = useUi();
  const syncService = useSyncService();
  const syncSummary = summarize(useSyncStatus(), useNow());
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [profiles, setProfiles] = useState<CrewProfile[] | null>(null);

  const services = ctx?.services;
  useEffect(() => {
    let cancelled = false;
    void services?.profiles.list().then((list) => {
      if (!cancelled) setProfiles(list);
    });
    return () => {
      cancelled = true;
    };
  }, [services, actor, open]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(ITEM)?.focus();
  }, [open]);

  // Outside click closes the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && root.current.contains(e.target as Node)) return;
      close(false);
      // Give focus back unless the click landed on something else that takes it.
      setTimeout(() => {
        if (document.activeElement === document.body || document.activeElement === null) trigger.current?.focus();
      }, 0);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  const move = (delta: number | 'first' | 'last') => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = delta === 'first' ? 0 : delta === 'last' ? items.length - 1 : (at + delta + items.length) % items.length;
    items[next]!.focus();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move('first');
    } else if (e.key === 'End') {
      e.preventDefault();
      move('last');
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const act = (fn: () => void) => () => {
    close(false);
    fn();
  };

  const others = (profiles ?? []).filter((p) => p.id !== actor.profileId);
  const roleLabel = ROLE_LABEL[actor.role];

  return (
    <div className="user-menu" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Profile menu, ${actor.name}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className="user-menu__avatar" aria-hidden="true">
          {initials(actor.name)}
        </span>
        <span className="user-menu__name">{actor.name}</span>
        {syncSummary ? <span className={`sync-dot sync-dot--${syncSummary.tone}`} aria-hidden="true" title={syncSummary.label} /> : null}
      </button>

      {open ? (
        <div id={menuId} className="user-menu__popover" role="menu" aria-label="Profile menu" ref={menu} onKeyDown={onMenuKey}>
          <div className="user-menu__head">
            <span className="user-menu__head-name">{actor.name}</span>
            <span className="muted small">{roleLabel}</span>
            {syncSummary ? (
              <span className="muted small" data-testid="sync-status">
                {syncSummary.label}
              </span>
            ) : null}
          </div>

          {ctx ? (
            <div role="group" aria-label="Switch profile">
              <p className="user-menu__label" aria-hidden="true">
                Switch profile
              </p>
              {others.map((p) => (
                <button key={p.id} type="button" role="menuitem" className="user-menu__item" onClick={act(() => ctx.switchProfile(p.id))}>
                  <span>{p.name}</span>
                  <span className="muted small">
                    {ROLE_LABEL[p.role]}
                    {p.pin ? ', PIN' : ''}
                  </span>
                </button>
              ))}
              <button type="button" role="menuitem" className="user-menu__item" onClick={act(() => ctx.switchProfile())}>
                All profiles...
              </button>
              {can(actor.role, 'manageProfiles', profiles ? policyContextOf(profiles) : {}) ? (
                <button type="button" role="menuitem" className="user-menu__item" onClick={act(() => setView('profiles'))}>
                  Manage profiles...
                </button>
              ) : null}
            </div>
          ) : null}

          {can(actor.role, 'manageProfiles') ? (
            <div role="group" aria-label="Sync">
              {syncService ? (
                <button type="button" role="menuitem" className="user-menu__item" onClick={act(() => setView('sync'))}>
                  Mission control sync...
                </button>
              ) : (
                // Kept visible but inert so the CMO learns why sync is missing instead of wondering where it went.
                <button type="button" role="menuitem" className="user-menu__item" aria-disabled="true">
                  Mission control sync
                  <span className="muted small">
                    {mode === 'demo' ? 'Not available in DEMO mode' : 'Not configured on this build (VITE_API_URL)'}
                  </span>
                </button>
              )}
            </div>
          ) : null}

          {can(actor.role, 'decideRecommendation') ? (
            <div role="group" aria-label="Assistant">
              <button type="button" role="menuitem" className="user-menu__item" onClick={act(() => setAiSettingsOpen(true))}>
                AI assistant...
              </button>
            </div>
          ) : null}

          {mode === 'demo' ? (
            <div role="group" aria-label="Demo">
              <p className="user-menu__label" aria-hidden="true">
                Demo
              </p>
              <button type="button" role="menuitem" className="user-menu__item" onClick={act(() => void actions.advanceDay())}>
                Advance one day
              </button>
              <button type="button" role="menuitem" className="user-menu__item" onClick={act(() => setConfirming(true))}>
                Reset demo
              </button>
            </div>
          ) : null}

          <div role="group" aria-label="Mode">
            <a role="menuitem" className="user-menu__item" href={mode === 'demo' ? '?mode=live' : '?mode=demo'}>
              Switch to {mode === 'demo' ? 'LIVE' : 'DEMO'}
            </a>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <Dialog
          title="Reset the demo?"
          closeLabel="Cancel reset"
          onClose={() => setConfirming(false)}
          style={{ width: 'min(480px, 92vw)' }}
        >
          <div className="stack">
            <p>This deletes demo entries, outbox and decisions, and returns to day 150.</p>
            <div className="proposal__actions">
              <Button
                variant="primary"
                onClick={() => {
                  setConfirming(false);
                  void actions.resetDemo();
                }}
              >
                Yes, reset
              </Button>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
