import { ClipboardText, X } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { useBrand } from '../brand/brand-context';
import { BodyMapContainer } from '../features/body-map/BodyMapContainer';
import { CheckInContainer } from '../features/check-in/CheckInContainer';
import { CmoContainer } from '../features/cmo/CmoContainer';
import { DemoControls } from '../features/demo/DemoControls';
import { SourcesView } from '../features/disclosures/SourcesView';
import { AlertRailContainer } from '../features/insights/AlertRailContainer';
import { ZonePanelContainer } from '../features/insights/ZonePanelContainer';
import { useZones } from '../features/insights/use-zones';
import { OutboxContainer } from '../features/outbox/OutboxContainer';
import { Badge } from '../ui/Badge';
import { useAppState } from './app-context';
import { useUi } from './ui-state';
import type { View } from './ui-state';

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'comms', label: 'Comms' },
  { id: 'sources', label: 'Sources' },
];

function Header() {
  const brand = useBrand();
  const { view, setView, checkInOpen, setCheckInOpen } = useUi();
  const mode = useAppState((s) => s.mode);
  const today = useAppState((s) => s.mission.today);
  const transitDays = useAppState((s) => s.mission.transitDays);
  const destination = useAppState((s) => s.mission.destination);
  const pending = useAppState((s) => s.session?.outbox.filter((m) => m.state !== 'replyPossible').length ?? 0);
  const progress = Math.min(100, Math.max(0, Math.round((today / transitDays) * 100)));

  return (
    <header className="header">
      <div className="header__row">
        <div className="brand">
          <img className="brand__mark" src={brand.logos.mark} alt="" width={28} height={28} />
          <span className="brand__name">{brand.productName}</span>
        </div>
        <nav className="nav" aria-label="Views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="nav__button"
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => setView(v.id)}
            >
              {v.label}
              {v.id === 'comms' && pending > 0 ? (
                <span className="nav__count" aria-label={`${pending} open`}>
                  {pending}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="header__status">
          <div className="badges">
            <Badge variant="solid">{mode === 'live' ? 'LIVE' : 'DEMO'}</Badge>
            {mode === 'demo' ? <Badge variant="dashed">SYNTHETIC</Badge> : null}
          </div>
          <div className="mission">
            <span className="mission-day">
              Day {today} of {transitDays}
            </span>
            <div
              className="mission-track"
              role="progressbar"
              aria-label={`Mission progress to ${destination}`}
              aria-valuemin={0}
              aria-valuemax={transitDays}
              aria-valuenow={Math.min(today, transitDays)}
            >
              <div className="mission-track__fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <div className="header__tools">
          {mode === 'demo' ? <DemoControls /> : null}
          <a className="button button--small button--ghost" href={mode === 'demo' ? '?mode=live' : '?mode=demo'}>
            Switch to {mode === 'demo' ? 'LIVE' : 'DEMO'}
          </a>
          {view === 'dashboard' ? (
            <button
              type="button"
              className="button button--small button--primary"
              aria-expanded={checkInOpen}
              aria-controls="check-in-drawer"
              onClick={() => setCheckInOpen(!checkInOpen)}
            >
              <ClipboardText size={16} weight="bold" aria-hidden="true" />
              Check-in
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const brand = useBrand();
  return (
    <footer className="footer">
      <p className="footer__disclaimer">
        Decision support, not medical advice. Thresholds need validation by flight surgeons.
      </p>
      <p className="muted">Entry for the {brand.eventLabel}.</p>
    </footer>
  );
}

function CheckInDrawer() {
  const { checkInOpen, setCheckInOpen } = useUi();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (checkInOpen) ref.current?.focus();
  }, [checkInOpen]);
  if (!checkInOpen) return null;
  return (
    <aside className="drawer" id="check-in-drawer" aria-labelledby="check-in-title" tabIndex={-1} ref={ref}>
      <div className="drawer__head">
        <div>
          <h2 id="check-in-title">Daily check-in</h2>
          <p className="muted small">Fill in what you measured. Leave the rest empty.</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close check-in" onClick={() => setCheckInOpen(false)}>
          <X size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <CheckInContainer />
    </aside>
  );
}

function Dashboard() {
  const { focusZoneId, clearZone } = useZones();
  const { checkInOpen, setCheckInOpen } = useUi();

  // Esc steps back: first closes the check-in, then leaves the focused organ.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (checkInOpen) setCheckInOpen(false);
      else if (focusZoneId) clearZone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checkInOpen, focusZoneId, clearZone, setCheckInOpen]);

  return (
    <div className="dashboard">
      <aside className="dashboard__rail" aria-labelledby="zones-title">
        <h2 className="section-title" id="zones-title">
          Zones
        </h2>
        <p className="muted small">Most urgent first.</p>
        <AlertRailContainer />
      </aside>
      <section className="dashboard__stage" aria-labelledby="body-title">
        <h2 className="sr-only" id="body-title">
          Body
        </h2>
        <BodyMapContainer />
        <p className="stage__hint" aria-hidden="true">
          {focusZoneId ? 'Esc or Full body to go back' : 'Drag to rotate · Scroll to zoom · Click an organ'}
        </p>
      </section>
      <div className="dashboard__panel">
        <ZonePanelContainer />
      </div>
      <CheckInDrawer />
    </div>
  );
}

function Comms() {
  return (
    <div className="comms">
      <CmoContainer />
      <OutboxContainer />
    </div>
  );
}

/** Persistent header and footer around every view. */
export function AppShell() {
  const { view } = useUi();
  const storageAvailable = useAppState((s) => s.storageAvailable);
  return (
    <div className={`app app--${view}`}>
      <Header />
      <main className="main" id="main">
        {!storageAvailable ? (
          <p className="banner" role="alert">
            Storage is unavailable in this browser. Entries will not be kept.
          </p>
        ) : null}
        {view === 'dashboard' ? <Dashboard /> : view === 'comms' ? <Comms /> : <SourcesView />}
      </main>
      <Footer />
    </div>
  );
}
