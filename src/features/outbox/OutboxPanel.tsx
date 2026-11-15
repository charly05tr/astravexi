import { Send } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState, Panel } from '../../ui/Panel';
import type { OutboxCardView } from './outbox-model';

export interface OutboxPanelProps {
  cards: readonly OutboxCardView[];
  oneWayDelayMin: number;
  minDelay: number;
  maxDelay: number;
  blackout: boolean;
  blackoutEnabled: boolean;
  /** "1 s = 1 min" in DEMO, "real minutes" in LIVE. */
  scaleLabel: string;
  isLive: boolean;
  onDelay(minutes: number): void;
  onBlackout(on: boolean): void;
  onSend(id: string): void;
}

/** What leaves the device: the payload preview for one card. Collapsed by default to keep outbox scannable. */
export function PayloadPreview({ json, sent }: { json: string; sent: boolean }) {
  return (
    <details className="outbox-payload">
      <summary>{sent ? 'What was sent' : 'What would be sent'}</summary>
      <pre className="payload" aria-label="Message payload">
        {json}
      </pre>
    </details>
  );
}

/** Earth link, simulated. Presentational: state and actions come in as props. */
export function OutboxPanel(props: OutboxPanelProps) {
  const link = props.isLive
    ? 'Simulated link. Nothing leaves this device. Real minutes.'
    : `Simulated link. ${props.scaleLabel}.`;
  return (
    <Panel
      id="outbox"
      title="Earth outbox"
      icon={<Send size={20} aria-hidden="true" />}
      hint="Warnings queue here before leaving. Mood leaves as a tier only."
    >
      <div className="link-controls link-controls--compact">
        <div className="link-controls__top">
          <p className="sim-label">{link}</p>
          {props.blackoutEnabled ? (
            <label className="toggle">
              <input
                type="checkbox"
                role="switch"
                checked={props.blackout}
                onChange={(e) => props.onBlackout(e.target.checked)}
              />
              Link blackout
            </label>
          ) : null}
        </div>
        <div className="field">
          <div className="link-controls__slider-head">
            <label className="field__label" htmlFor="link-delay">
              One-way delay: <span className="mono">{props.oneWayDelayMin} min</span>
            </label>
            <span className="field__hint">Earliest reply: 2× delay</span>
          </div>
          <input
            id="link-delay"
            className="slider"
            type="range"
            min={props.minDelay}
            max={props.maxDelay}
            step={1}
            value={props.oneWayDelayMin}
            aria-valuetext={`${props.oneWayDelayMin} minutes one way`}
            onChange={(e) => props.onDelay(Number(e.target.value))}
          />
        </div>
      </div>

      {props.cards.length === 0 ? (
        <EmptyState>No messages yet.</EmptyState>
      ) : (
        <ul className="item-list">
          {props.cards.map((c) => (
            <li className="item" key={c.id} data-state={c.state} data-testid="outbox-message">
              <div className="item__head">
                <strong>To flight surgeon: {c.zoneLabel}</strong>
                <span className={`state-pill${c.state === 'held' ? ' state-pill--held' : ''}`}>{c.stateLabel}</span>
              </div>
              <p className="item__meta">{c.createdText}</p>
              <p className="outbox-reply">{c.replyText}</p>
              <div className="outbox-card__footer">
                {c.state === 'queued' ? (
                  <Button size="small" variant="primary" disabled={!c.canSend} onClick={() => props.onSend(c.id)}>
                    Send now
                  </Button>
                ) : null}
                <PayloadPreview json={c.payloadJson} sent={c.state === 'sent' || c.state === 'replyPossible'} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
