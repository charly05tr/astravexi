import { ClipboardList } from 'lucide-react';
import { useEffect } from 'react';
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
import { Dialog } from '../ui/Dialog';
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
  const { view, setView, setCheckInOpen } = useUi();
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
          {/* The full logo carries the wordmark; the name stays in the accessibility tree. */}
          <img className="brand__logo" src={brand.logos.full} alt="" height={32} />
          <span className="sr-only">{brand.productName}</span>
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
              aria-haspopup="dialog"
              onClick={() => setCheckInOpen(true)}
            >
              <ClipboardList size={16} aria-hidden="true" />
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

/** The full daily check-in, in a modal dialog over the dashboard. */
function CheckInDialog() {
  const { checkInOpen, setCheckInOpen } = useUi();
  if (!checkInOpen) return null;
  return (
    <Dialog
      title="Daily check-in"
      closeLabel="Close check-in"
      onClose={() => setCheckInOpen(false)}
      style={{ width: 'min(640px, 92vw)' }}
    >
      <div className="check-in-dialog">
        <p className="muted small">Fill in what you measured. Leave the rest empty.</p>
        <CheckInContainer />
      </div>
    </Dialog>
  );
}

function Dashboard() {
  const { focusZoneId, clearZone } = useZones();

  // Esc steps back out of a focused organ.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Open dialogs (check-in, zone detail) consume Esc themselves; here it only leaves the focused organ.
      if (focusZoneId) clearZone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusZoneId, clearZone]);

  return (
    <div className="dashboard">
      <aside className="dashboard__rail" aria-label="Zones">
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
      <CheckInDialog />
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
      {view !== 'dashboard' ? <Footer /> : null}
    </div>
  );
}
