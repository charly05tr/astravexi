import { PaperPlaneTilt } from '@phosphor-icons/react';
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

/** What leaves the device: the payload preview for one card. Mood and other private scores are tier-only. */
export function PayloadPreview({ json, sent }: { json: string; sent: boolean }) {
  return (
    <details open>
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
      icon={<PaperPlaneTilt size={20} aria-hidden="true" />}
      hint="Warnings wait here until you send them. Only tiers and the listed triggers leave; mood is sent as a tier, never a score."
    >
      <p className="sim-label">{link}</p>
      <div className="link-controls">
        <div className="field">
          <label className="field__label" htmlFor="link-delay">
            One-way delay: <span className="mono">{props.oneWayDelayMin} min</span>
          </label>
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
          <p className="field__hint">Earliest reply is 2 x the delay after sending. The delay is read when you send.</p>
        </div>
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

      {props.cards.length === 0 ? (
        <EmptyState>No messages. A Warning creates one message per zone and check-in.</EmptyState>
      ) : (
        <ul className="item-list">
          {props.cards.map((c) => (
            <li className="item" key={c.id} data-state={c.state} data-testid="outbox-message">
              <div className="item__head">
                <strong>To flight surgeon: {c.zoneLabel}</strong>
                <span className={`state-pill${c.state === 'held' ? ' state-pill--held' : ''}`}>{c.stateLabel}</span>
              </div>
              <p className="item__meta">{c.createdText}</p>
              <p>{c.replyText}</p>
              {c.state === 'queued' ? (
                <div>
                  <Button size="small" variant="primary" disabled={!c.canSend} onClick={() => props.onSend(c.id)}>
                    Send now
                  </Button>
                </div>
              ) : null}
              <PayloadPreview json={c.payloadJson} sent={c.state === 'sent' || c.state === 'replyPossible'} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
