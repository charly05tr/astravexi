import { ExternalLink, SlidersHorizontal, Wind } from 'lucide-react';
import { useState } from 'react';
import { useAppState } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import {
  HABITAT_ORDER,
  HABITAT_PRESETS,
  co2PpmFromMmHg,
  computeAccumulatedMsv,
} from './environment-model';
import type { EnvironmentZoneAssessment } from './environment-model';

interface EnvironmentDialogProps {
  onClose(): void;
}

/**
 * Interactive mission habitat simulator dialog: switches spacecraft/base presets and lets crew adjust
 * CO2, noise, radiation dose rate, and Solar Particle Event (SPE) exposure against NASA limits.
 */
export function EnvironmentDialog({ onClose }: EnvironmentDialogProps) {
  const { environment, setHabitatPreset, updateEnvironment, resetEnvironment } = useUi();
  const missionDay = useAppState((s) => s.mission.today);
  const preset = HABITAT_PRESETS[environment.habitat];
  const accumulatedMsv = computeAccumulatedMsv(missionDay, environment.radiationMsvDay, environment.speActive);
  const co2Ppm = co2PpmFromMmHg(environment.ppCo2MmHg);

  return (
    <Dialog
      eyebrow="Module 2 · Habitat telemetry"
      title="Environment & NASA bounds"
      closeLabel="Close habitat controls"
      onClose={onClose}
      style={{ width: 'min(560px, 92vw)' }}
    >
      <div className="stack" style={{ gap: 16 }} data-testid="environment-dialog">
        <p className="muted small">
          Configure habitat conditions to separate environmental strain (CO2, acoustics, radiation) from intrinsic
          physiological changes.
        </p>

        <div className="env-presets" role="group" aria-label="Mission habitat preset">
          {HABITAT_ORDER.map((id) => {
            const p = HABITAT_PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                className="symptom-chip env-preset"
                aria-pressed={environment.habitat === id}
                onClick={() => setHabitatPreset(id)}
              >
                <span className="symptom-chip__label">{p.label}</span>
                <span className="symptom-chip__hint">{p.summary}</span>
              </button>
            );
          })}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="env-co2">
            Cabin ppCO2:{' '}
            <span className="mono">
              {environment.ppCo2MmHg.toFixed(1)} mmHg ({co2Ppm} ppm)
            </span>
          </label>
          <input
            id="env-co2"
            className="slider"
            type="range"
            min={0.5}
            max={6.0}
            step={0.1}
            value={environment.ppCo2MmHg}
            onChange={(e) => updateEnvironment({ ppCo2MmHg: Number(e.target.value) })}
          />
          <span className="field__hint">OCHMO-TB-004 attention threshold: &gt;= 3.0 mmHg (~3950 ppm)</span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="env-noise">
            Acoustic level: <span className="mono">{environment.noiseDba} dBA</span>
          </label>
          <input
            id="env-noise"
            className="slider"
            type="range"
            min={45}
            max={85}
            step={1}
            value={environment.noiseDba}
            onChange={(e) => updateEnvironment({ noiseDba: Number(e.target.value) })}
          />
          <span className="field__hint">NASA-STD-3001 continuous sleep/focus margin: &lt; 65 dBA</span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="env-radiation">
            Radiation rate: <span className="mono">{environment.radiationMsvDay.toFixed(2)} mSv/day</span> · Cumulative{' '}
            <span className="mono">{accumulatedMsv} mSv</span>
          </label>
          <input
            id="env-radiation"
            className="slider"
            type="range"
            min={0.2}
            max={5.0}
            step={0.05}
            value={environment.radiationMsvDay}
            onChange={(e) => updateEnvironment({ radiationMsvDay: Number(e.target.value) })}
          />
          <span className="field__hint">RadLab benchmark: LEO ~0.52 mSv/day vs deep-space transit ~1.84 mSv/day</span>
        </div>

        <label className="env-spe-toggle">
          <input
            type="checkbox"
            checked={environment.speActive}
            onChange={(e) => updateEnvironment({ speActive: e.target.checked })}
          />
          <span>
            <strong>Solar Particle Event (SPE) active</strong>
            <span className="muted small" style={{ display: 'block' }}>
              Adds +18 mSv storm transient and flags shelter shielding priority across crew zones ({preset.shortLabel}).
            </span>
          </span>
        </label>

        <div className="form-actions">
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
          <Button type="button" onClick={resetEnvironment}>
            Reset defaults
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Compact stage pill anchored cleanly at bottom-center above the 3D hint so crew can inspect and adjust
 * cabin CO2, acoustics, and radiation without adding a second header row or obscuring organs.
 */
export function StageHabitatBar() {
  const { environment } = useUi();
  const [open, setOpen] = useState(false);
  const preset = HABITAT_PRESETS[environment.habitat];

  return (
    <>
      <button
        type="button"
        className="stage__habitat"
        aria-haspopup="dialog"
        data-testid="habitat-trigger"
        onClick={() => setOpen(true)}
      >
        <Wind size={13} aria-hidden="true" />
        <span>
          {preset.shortLabel} · CO2 {environment.ppCo2MmHg.toFixed(1)} mmHg · {environment.noiseDba} dBA
          {environment.speActive ? ' · SPE' : ''}
        </span>
        <SlidersHorizontal size={12} aria-hidden="true" />
      </button>
      {open ? <EnvironmentDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Minimal attribution card rendered inside ZonePanel showing Environment vs. Individual separation.
 */
export function ZoneEnvironmentCard({ assessment }: { assessment: EnvironmentZoneAssessment }) {
  const [open, setOpen] = useState(false);
  const pillClass =
    assessment.attribution === 'environmental' || assessment.attribution === 'mixed'
      ? 'env-attribution__badge env-attribution__badge--active'
      : 'env-attribution__badge';

  return (
    <>
      <section className="env-attribution" aria-label="Environment vs. individual context" data-testid="env-attribution">
        <div className="env-attribution__head">
          <Badge variant={assessment.attribution === 'nominal' ? 'dashed' : 'solid'}>
            <span className={pillClass}>{assessment.badgeLabel}</span>
          </Badge>
          <button
            type="button"
            className="link-button env-attribution__btn"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            Adjust habitat
          </button>
        </div>
        <p className="env-attribution__text">{assessment.summary}</p>
      </section>
      {open ? <EnvironmentDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Technical NASA benchmark comparison rendered inside the Zone detail dialog. */
export function ZoneBenchmarkSection({ assessment }: { assessment: EnvironmentZoneAssessment }) {
  const { benchmark } = assessment;
  if (!benchmark) return null;
  return (
    <section className="zone-section" aria-labelledby="zone-nasa-benchmark">
      <h3 id="zone-nasa-benchmark">NASA reference benchmark</h3>
      <div className="env-benchmark">
        <div className="env-benchmark__head">
          <strong className="mono">{benchmark.code}</strong>
          <span className="muted small">Accumulated exposure: {assessment.accumulatedMsv} mSv</span>
        </div>
        <p style={{ margin: '4px 0 6px', fontWeight: 600 }}>{benchmark.title}</p>
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          {benchmark.note}
        </p>
        <a href={benchmark.url} target="_blank" rel="noreferrer" className="small">
          {benchmark.code} source <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
