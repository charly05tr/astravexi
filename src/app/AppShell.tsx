import { Heartbeat, Lifebuoy } from '@phosphor-icons/react';
import { useBrand } from '../brand/brand-context';
import { BodyMapContainer } from '../features/body-map/BodyMapContainer';
import { CheckInContainer } from '../features/check-in/CheckInContainer';
import { CmoContainer } from '../features/cmo/CmoContainer';
import { DemoControls } from '../features/demo/DemoControls';
import { SourcesView } from '../features/disclosures/SourcesView';
import { AlertRailContainer } from '../features/insights/AlertRailContainer';
import { ZonePanelContainer } from '../features/insights/ZonePanelContainer';
import { OutboxContainer } from '../features/outbox/OutboxContainer';
import { Badge } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { useAppState } from './app-context';
import { useUi } from './ui-state';
import type { View } from './ui-state';

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sources', label: 'Sources' },
];

function Header() {
  const brand = useBrand();
  const { view, setView } = useUi();
  const mode = useAppState((s) => s.mode);
  const today = useAppState((s) => s.mission.today);
  const transitDays = useAppState((s) => s.mission.transitDays);
  const destination = useAppState((s) => s.mission.destination);
  const progress = Math.min(100, Math.max(0, Math.round((today / transitDays) * 100)));

  return (
    <header className="header">
      <div className="header__row">
        <div className="brand">
          <img className="brand__mark" src={brand.logos.mark} alt="" width={36} height={36} />
          <span className="brand__name">{brand.productName}</span>
        </div>
        <div className="badges">
          <Badge variant="solid">{mode === 'live' ? 'LIVE' : 'DEMO'}</Badge>
          {mode === 'demo' ? <Badge variant="dashed">SYNTHETIC</Badge> : null}
          <span className="mission-day">
            Day {today} of {transitDays}
          </span>
        </div>
      </div>
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
      <div className="header__tools">
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
            </button>
          ))}
        </nav>
        {mode === 'demo' ? <DemoControls /> : null}
        <a className="button button--small" href={mode === 'demo' ? '?mode=live' : '?mode=demo'}>
          Switch to {mode === 'demo' ? 'LIVE' : 'DEMO'}
        </a>
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

function Dashboard() {
  return (
    <div className="dashboard">
      <div className="stack">
        <Panel id="body" title="Body" icon={<Heartbeat size={20} aria-hidden="true" />} hint="Select a zone, here or in the list.">
          <BodyMapContainer />
        </Panel>
        <Panel id="zones" title="Zones" hint="Sorted by alert tier.">
          <AlertRailContainer />
        </Panel>
      </div>
      <ZonePanelContainer />
      <div className="dashboard__side">
        <Panel
          id="check-in"
          title="Daily check-in"
          icon={<Lifebuoy size={20} aria-hidden="true" />}
          hint="Fill in what you measured. Leave the rest empty."
        >
          <CheckInContainer />
        </Panel>
        <CmoContainer />
        <OutboxContainer />
      </div>
    </div>
  );
}

/** Persistent header and footer around every view. */
export function AppShell() {
  const { view } = useUi();
  const storageAvailable = useAppState((s) => s.storageAvailable);
  return (
    <div className="app">
      <Header />
      <main className="main" id="main">
        {!storageAvailable ? (
          <p className="banner" role="alert">
            Storage is unavailable in this browser. Entries will not be kept.
          </p>
        ) : null}
        {view === 'dashboard' ? <Dashboard /> : <SourcesView />}
      </main>
      <Footer />
    </div>
  );
}
