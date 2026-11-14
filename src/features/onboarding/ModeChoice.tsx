import { Flask } from '@phosphor-icons/react';
import { useBrand } from '../../brand/brand-context';
import type { AppMode } from '../../app/mode';

/** First visit: choose real tracking or the simulated demo. The choice is persisted by the caller. */
export function ModeChoice({ onChoose }: { onChoose(mode: AppMode): void }) {
  const brand = useBrand();
  return (
    <main className="center-stage" id="main">
      <header className="stack" style={{ gap: 8 }}>
        <img src={brand.logos.mark} alt="" width={48} height={48} />
        <h1>{brand.productName}</h1>
        <p>Early-warning support for crew health on long missions. Pick how you want to start.</p>
      </header>
      <div className="choice-grid">
        <button type="button" className="choice" onClick={() => onChoose('live')}>
          <span className="choice__title">Track my own health</span>
          <span className="muted">Starts empty. You enter daily check-ins. Data stays on this device.</span>
        </button>
        <button type="button" className="choice" onClick={() => onChoose('demo')}>
          <span className="choice__title">
            <Flask size={20} aria-hidden="true" /> Explore the demo with simulated data
          </span>
          <span className="muted">A synthetic crew member on day 150 of a 210-day transit. Everything is labeled SYNTHETIC.</span>
        </button>
      </div>
      <p className="muted">Decision support, not medical advice.</p>
    </main>
  );
}
