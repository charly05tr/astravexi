import { AlertTriangle, PackageCheck, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import type { ZoneId } from '../../core/health/model';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { tierStyle } from '../../ui/TierChip';
import type { TriageProtocolPlan } from '../triage/triage-model';
import {
  XHER_ALLERGY_CATALOG,
  evaluateInventoryAndAllergies,
} from './inventory-model';
import type { StockLevel } from './inventory-model';

type InventoryTab = 'stock' | 'allergies';

function stockTierStyle(level: StockLevel) {
  if (level === 'depleted') return tierStyle('warning');
  if (level === 'low') return tierStyle('notice');
  return tierStyle('none');
}

function stockLabel(level: StockLevel): string {
  if (level === 'depleted') return 'Depleted';
  if (level === 'low') return 'Low stock';
  return 'Nominal';
}

export function MedicalInventoryDialog({
  initialZoneId = null,
  initialZoneLabel,
  initialTab = 'stock',
  triagePlan = null,
  onClose,
}: {
  initialZoneId?: ZoneId | null;
  initialZoneLabel?: string;
  initialTab?: InventoryTab;
  triagePlan?: TriageProtocolPlan | null;
  onClose(): void;
}) {
  const { knowledge } = useAppContext();
  const session = useAppState((s) => s.session);
  const {
    xehrAllergies,
    toggleXehrAllergy,
    clearXehrAllergies,
    hmsUsedCounts,
    consumeHmsSupply,
    resetHmsSupplies,
  } = useUi();

  const [tab, setTab] = useState<InventoryTab>(initialTab);
  const [scopeAll, setScopeAll] = useState(initialZoneId === null);

  const activeZoneId = scopeAll ? null : initialZoneId;
  const zone = useMemo(
    () => (activeZoneId ? knowledge.zones.find((z) => z.id === activeZoneId) ?? null : null),
    [knowledge, activeZoneId],
  );

  const readings = useMemo(
    () => (session ? [...session.synthetic, ...session.manual] : []),
    [session],
  );

  const evaluation = useMemo(() => {
    if (!session) return null;
    return evaluateInventoryAndAllergies({
      zoneId: activeZoneId,
      indicators: knowledge.indicators,
      zoneIndicatorIds: zone?.indicatorIds,
      readings,
      asOf: session.evaluation.asOf,
      allergies: xehrAllergies,
      usedCounts: hmsUsedCounts,
      triagePlan,
    });
  }, [session, activeZoneId, knowledge.indicators, zone, readings, xehrAllergies, hmsUsedCounts, triagePlan]);

  if (!evaluation) return null;
  const hasModifications = xehrAllergies.length > 0 || Object.keys(hmsUsedCounts).length > 0;

  return (
    <Dialog
      eyebrow="Module 5 · HMS inventory & xEHR"
      title={zone ? `HMS stock & allergies · ${zone.label}` : 'HMS Medical Kit & xEHR Profile'}
      closeLabel="Close HMS inventory"
      aside={
        evaluation.statusEquivalent !== 'none' ? (
          <span className="tier-chip" style={tierStyle(evaluation.statusEquivalent)}>
            {evaluation.allergyConflictsCount > 0 ? 'Allergy conflict' : 'Consumable notice'}
          </span>
        ) : undefined
      }
      onClose={onClose}
      style={{ width: 'min(620px, 94vw)' }}
    >
      <div className="stack" style={{ gap: 14 }} data-testid="inventory-dialog">
        <p className="inventory-safeguard" role="note">
          <ShieldAlert size={15} aria-hidden="true" />
          <span>{evaluation.safeguard}</span>
        </p>

        <div className="triage-mode-bar">
          <div className="segmented" role="group" aria-label="HMS section">
            <button type="button" aria-pressed={tab === 'stock'} onClick={() => setTab('stock')}>
              HMS Stock ({evaluation.items.length})
            </button>
            <button type="button" aria-pressed={tab === 'allergies'} onClick={() => setTab('allergies')}>
              xEHR Allergies ({xehrAllergies.length})
            </button>
          </div>

          {initialZoneId && tab === 'stock' ? (
            <div className="segmented" role="group" aria-label="Inventory scope">
              <button type="button" aria-pressed={!scopeAll} onClick={() => setScopeAll(false)}>
                {initialZoneLabel ?? 'Current zone'}
              </button>
              <button type="button" aria-pressed={scopeAll} onClick={() => setScopeAll(true)}>
                All lockers
              </button>
            </div>
          ) : null}
        </div>

        {tab === 'stock' ? (
          <div className="stack" style={{ gap: 12 }}>
            {evaluation.redundantChecks.length > 0 ? (
              <section
                className="inventory-redundant"
                style={tierStyle('notice')}
                data-testid="redundant-check-warning"
              >
                <strong>
                  <AlertTriangle size={14} aria-hidden="true" /> Consumable conservation (&lt; 60 min check)
                </strong>
                <ul className="inventory-redundant__list">
                  {evaluation.redundantChecks.map((w) => (
                    <li key={w.indicatorId}>
                      <strong>{w.indicatorLabel}:</strong> {w.reason}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <ul className="inventory-list">
              {evaluation.items.map((item) => {
                const hasConflict = item.conflictingAllergies.length > 0;
                return (
                  <li
                    key={item.id}
                    className={`inventory-item${hasConflict ? ' inventory-item--conflict' : ''}`}
                    style={hasConflict ? tierStyle('warning') : stockTierStyle(item.stockLevel)}
                    data-supply-id={item.id}
                  >
                    <div className="inventory-item__head">
                      <div>
                        <strong>{item.name}</strong>
                        <p className="muted small" style={{ margin: '2px 0 0' }}>
                          {item.location}
                        </p>
                      </div>
                      <div className="inventory-item__meta">
                        <span className="tier-chip" style={stockTierStyle(item.stockLevel)}>
                          {item.remaining} {item.unit} · {stockLabel(item.stockLevel)}
                        </span>
                        <Button
                          size="small"
                          disabled={item.remaining === 0}
                          onClick={() => consumeHmsSupply(item.id)}
                          aria-label={`Log 1 used of ${item.name}`}
                        >
                          Use 1
                        </Button>
                      </div>
                    </div>

                    <p className="inventory-item__note">{item.usageNote}</p>

                    {hasConflict ? (
                      <div className="inventory-conflict" role="alert">
                        <strong>
                          xEHR Conflict: {item.conflictingAllergies.map((a) => a.label).join(', ')}
                        </strong>
                        {item.safeAlternativeName ? (
                          <span> · Compatible stock: {item.safeAlternativeName}</span>
                        ) : (
                          <span> · Avoid kit item and coordinate CMO / Ground validation.</span>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }} data-testid="xehr-allergy-list">
            <p className="small muted" style={{ margin: 0 }}>
              Local onboard xEHR sensitivity record. Checked automatically before kit issuance.
            </p>
            {XHER_ALLERGY_CATALOG.map((allergy) => {
              const checked = xehrAllergies.includes(allergy.id);
              return (
                <label key={allergy.id} className={`allergy-option${checked ? ' allergy-option--checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleXehrAllergy(allergy.id)}
                  />
                  <div>
                    <strong>{allergy.label}</strong>
                    <p className="small muted" style={{ margin: '2px 0 0' }}>
                      Examples: {allergy.examples} — {allergy.precaution}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="form-actions">
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
          {hasModifications ? (
            <Button
              type="button"
              onClick={() => {
                clearXehrAllergies();
                resetHmsSupplies();
              }}
            >
              Reset xEHR &amp; stock demo
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Compact stage pill positioned beside Readiness & Habitat so the crew can check HMS stock,
 * xEHR allergy conflicts, and <60 min duplicate test alerts without cluttering the dashboard.
 */
export function StageInventoryTrigger() {
  const { knowledge } = useAppContext();
  const session = useAppState((s) => s.session);
  const { xehrAllergies, hmsUsedCounts, selectedZoneId } = useUi();
  const [open, setOpen] = useState(false);

  const readings = useMemo(
    () => (session ? [...session.synthetic, ...session.manual] : []),
    [session],
  );

  const evalAll = useMemo(() => {
    if (!session) return null;
    return evaluateInventoryAndAllergies({
      zoneId: null,
      indicators: knowledge.indicators,
      readings,
      asOf: session.evaluation.asOf,
      allergies: xehrAllergies,
      usedCounts: hmsUsedCounts,
    });
  }, [session, knowledge.indicators, readings, xehrAllergies, hmsUsedCounts]);

  if (!evalAll) return null;

  const alertCount =
    evalAll.allergyConflictsCount + evalAll.redundantChecks.length + evalAll.lowOrDepletedCount;
  const hasStatus = evalAll.statusEquivalent !== 'none';
  const activeZone = selectedZoneId
    ? knowledge.zones.find((z) => z.id === selectedZoneId) ?? null
    : null;

  return (
    <>
      <button
        type="button"
        className={hasStatus ? 'stage__readiness' : 'stage__habitat'}
        style={hasStatus ? tierStyle(evalAll.statusEquivalent) : undefined}
        aria-haspopup="dialog"
        data-testid="inventory-trigger"
        onClick={() => setOpen(true)}
      >
        <PackageCheck size={13} aria-hidden="true" />
        <span>
          HMS Kit
          {evalAll.allergyConflictsCount > 0
            ? ` · ${evalAll.allergyConflictsCount} allergy`
            : evalAll.redundantChecks.length > 0
              ? ` · ${evalAll.redundantChecks.length} <60m`
              : alertCount > 0
                ? ` · ${alertCount} notice`
                : ''}
        </span>
      </button>

      {open ? (
        <MedicalInventoryDialog
          initialZoneId={activeZone?.id ?? null}
          initialZoneLabel={activeZone?.label}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Compact HMS & xEHR check bar embedded inside GuidedTriageDialog so triage guidance automatically
 * flags allergy incompatibilities and duplicate consumable measurements (< 60 min).
 */
export function TriageInventoryCheck({
  zoneId,
  zoneLabel,
  triagePlan,
}: {
  zoneId: ZoneId;
  zoneLabel: string;
  triagePlan: TriageProtocolPlan;
}) {
  const { knowledge } = useAppContext();
  const session = useAppState((s) => s.session);
  const { xehrAllergies, hmsUsedCounts } = useUi();
  const [open, setOpen] = useState(false);

  const zone = useMemo(
    () => knowledge.zones.find((z) => z.id === zoneId) ?? null,
    [knowledge, zoneId],
  );
  const readings = useMemo(
    () => (session ? [...session.synthetic, ...session.manual] : []),
    [session],
  );

  const evaluation = useMemo(() => {
    if (!session) return null;
    return evaluateInventoryAndAllergies({
      zoneId,
      indicators: knowledge.indicators,
      zoneIndicatorIds: zone?.indicatorIds,
      readings,
      asOf: session.evaluation.asOf,
      allergies: xehrAllergies,
      usedCounts: hmsUsedCounts,
      triagePlan,
    });
  }, [session, zoneId, knowledge.indicators, zone, readings, xehrAllergies, hmsUsedCounts, triagePlan]);

  if (!evaluation) return null;

  return (
    <section
      className="triage-inventory-bar"
      style={
        evaluation.statusEquivalent !== 'none'
          ? tierStyle(evaluation.statusEquivalent)
          : undefined
      }
      data-testid="triage-inventory-check"
    >
      <div className="triage-inventory-bar__info">
        <strong>HMS Stock &amp; xEHR Check</strong>
        <p className="muted small" style={{ margin: '2px 0 0' }}>
          {evaluation.summary}
        </p>
      </div>
      <Button size="small" onClick={() => setOpen(true)}>
        Verify kit &amp; xEHR
      </Button>

      {open ? (
        <MedicalInventoryDialog
          initialZoneId={zoneId}
          initialZoneLabel={zoneLabel}
          triagePlan={triagePlan}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}
