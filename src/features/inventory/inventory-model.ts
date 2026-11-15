import type { AsOf, Indicator, IndicatorId, Reading, Tier, ZoneId } from '../../core/health/model';
import { formatValue } from '../shared/format';
import type { TriageProtocolPlan } from '../triage/triage-model';

export type AllergyId =
  | 'nsaids'
  | 'acetaminophen'
  | 'ophthalmic-preservatives'
  | 'medical-adhesives'
  | 'sulfonamides';

export interface XehrAllergyEntry {
  readonly id: AllergyId;
  readonly label: string;
  readonly examples: string;
  readonly precaution: string;
}

export type StockLevel = 'nominal' | 'low' | 'depleted';

export interface HmsSupplyItem {
  readonly id: string;
  readonly name: string;
  readonly category: 'diagnostic' | 'supportive' | 'consumable';
  readonly location: string;
  readonly zoneIds: readonly ZoneId[];
  readonly indicatorIds: readonly IndicatorId[];
  readonly defaultRemaining: number;
  readonly lowThreshold: number;
  readonly unit: string;
  readonly allergyTags: readonly AllergyId[];
  readonly alternativeItemId?: string;
  readonly usageNote: string;
}

export interface EvaluatedHmsItem extends HmsSupplyItem {
  readonly remaining: number;
  readonly stockLevel: StockLevel;
  readonly conflictingAllergies: readonly XehrAllergyEntry[];
  readonly safeAlternativeName: string | null;
}

export interface RedundantMeasurementWarning {
  readonly indicatorId: IndicatorId;
  readonly indicatorLabel: string;
  readonly minutesAgo: number;
  readonly lastValueText: string;
  readonly consumableName: string;
  readonly reason: string;
}

export interface InventoryEvaluation {
  readonly zoneId: ZoneId | null;
  readonly items: readonly EvaluatedHmsItem[];
  readonly allergyConflictsCount: number;
  readonly lowOrDepletedCount: number;
  readonly redundantChecks: readonly RedundantMeasurementWarning[];
  readonly statusEquivalent: Tier | 'none';
  readonly summary: string;
  readonly safeguard: string;
}

export const HMS_SAFEGUARD_TEXT =
  'HMS inventory & xEHR allergy check only — Astravexi never prescribes medications, selects treatments, or generates dosages.';

export const XHER_ALLERGY_CATALOG: readonly XehrAllergyEntry[] = [
  {
    id: 'nsaids',
    label: 'NSAIDs (Ibuprofen / Naproxen)',
    examples: 'Ibuprofen tablets, ketorolac pack',
    precaution: 'Flag NSAID-containing relief kits; coordinate non-pharmacologic rest/hydration or CMO review.',
  },
  {
    id: 'acetaminophen',
    label: 'Acetaminophen / Paracetamol',
    examples: 'Acetaminophen oral caplets',
    precaution: 'Flag acetaminophen kits in HMS Locker; avoid inadvertent duplicate antipyretic supply use.',
  },
  {
    id: 'ophthalmic-preservatives',
    label: 'Ophthalmic preservatives (BAK)',
    examples: 'Multi-dose preserved artificial tears',
    precaution: 'Switch to single-dose preservative-free artificial tears before SANS/dry-eye relief.',
  },
  {
    id: 'medical-adhesives',
    label: 'Medical adhesives / Acrylate',
    examples: 'Standard conductive ECG electrodes, adhesive tape',
    precaution: 'Substitute silicone/hydrogel hypoallergenic sensor patches to prevent skin breakdown.',
  },
  {
    id: 'sulfonamides',
    label: 'Sulfonamides',
    examples: 'Sulfonamide antimicrobial ointments / packs',
    precaution: 'Exclude sulfa-class topical kits during immune/skin irritation checks.',
  },
];

export const HMS_INVENTORY_CATALOG: readonly HmsSupplyItem[] = [
  {
    id: 'hms-preservative-free-tears',
    name: 'Preservative-free ocular vials',
    category: 'supportive',
    location: 'Crew Medical Kit A · Drawer 2',
    zoneIds: ['eyes'],
    indicatorIds: [],
    defaultRemaining: 18,
    lowThreshold: 5,
    unit: 'vials',
    allergyTags: [],
    usageNote: 'Single-use sterile saline/lubricating vials for dry cabin air or SANS visual discomfort.',
  },
  {
    id: 'hms-preserved-tears',
    name: 'Multi-dose ophthalmic drops (BAK)',
    category: 'supportive',
    location: 'Crew Medical Kit B · Bay 1',
    zoneIds: ['eyes'],
    indicatorIds: [],
    defaultRemaining: 4,
    lowThreshold: 2,
    unit: 'bottles',
    allergyTags: ['ophthalmic-preservatives'],
    alternativeItemId: 'hms-preservative-free-tears',
    usageNote: 'Standard multi-dose tear solution; check xEHR for BAK sensitivity before issuing.',
  },
  {
    id: 'hms-tonometer-tips',
    name: 'Tonometer sterile tip covers',
    category: 'diagnostic',
    location: 'Crew Medical Kit A · Eye Module',
    zoneIds: ['eyes'],
    indicatorIds: [],
    defaultRemaining: 6,
    lowThreshold: 4,
    unit: 'tips',
    allergyTags: [],
    usageNote: 'Disposable shields for intraocular pressure checks during SANS monitoring.',
  },
  {
    id: 'hms-co2-rebreather-check',
    name: 'Portable CO2 & light-block sleep mask kit',
    category: 'supportive',
    location: 'Crew Quarters Locker 2',
    zoneIds: ['brain'],
    indicatorIds: ['sleepHours', 'phq2'],
    defaultRemaining: 9,
    lowThreshold: 3,
    unit: 'kits',
    allergyTags: [],
    usageNote: 'Supports circadian anchor checks and cabin ventilation verification without drug kits.',
  },
  {
    id: 'hms-nsaids-pack',
    name: 'Standard analgesic relief pack (NSAID)',
    category: 'supportive',
    location: 'HMS Locked Bay · Slot 4',
    zoneIds: ['brain', 'bone'],
    indicatorIds: [],
    defaultRemaining: 12,
    lowThreshold: 4,
    unit: 'packs',
    allergyTags: ['nsaids'],
    alternativeItemId: 'hms-acetaminophen-pack',
    usageNote: 'Tracked for stock/allergy screening only; administration requires flight surgeon/CMO protocol.',
  },
  {
    id: 'hms-acetaminophen-pack',
    name: 'Non-NSAID fever/discomfort pack',
    category: 'supportive',
    location: 'HMS Locked Bay · Slot 5',
    zoneIds: ['brain', 'immune'],
    indicatorIds: ['temperature'],
    defaultRemaining: 10,
    lowThreshold: 4,
    unit: 'packs',
    allergyTags: ['acetaminophen'],
    usageNote: 'Tracked for stock/allergy screening only; never auto-dosed by onboarding software.',
  },
  {
    id: 'hms-ecg-electrodes',
    name: 'Standard conductive ECG electrodes',
    category: 'consumable',
    location: 'Crew Medical Kit A · Cardiac Bay',
    zoneIds: ['heart'],
    indicatorIds: ['heartRate'],
    defaultRemaining: 16,
    lowThreshold: 6,
    unit: 'pads',
    allergyTags: ['medical-adhesives'],
    alternativeItemId: 'hms-hypoallergenic-patches',
    usageNote: 'Routine 3-lead adhesive pads; screen xEHR for acrylate/adhesive contact allergy.',
  },
  {
    id: 'hms-hypoallergenic-patches',
    name: 'Silicone hypoallergenic sensor patches',
    category: 'consumable',
    location: 'Crew Medical Kit A · Cardiac Bay',
    zoneIds: ['heart'],
    indicatorIds: ['heartRate'],
    defaultRemaining: 8,
    lowThreshold: 4,
    unit: 'pads',
    allergyTags: [],
    usageNote: 'Gentle silicone-gel patches compatible with acrylate or adhesive sensitivity.',
  },
  {
    id: 'hms-bp-cuff-kit',
    name: 'Automated BP cuff & alcohol prep swabs',
    category: 'diagnostic',
    location: 'Crew Medical Kit A · Vitals Tray',
    zoneIds: ['heart'],
    indicatorIds: ['bpSystolic', 'bpDiastolic'],
    defaultRemaining: 22,
    lowThreshold: 6,
    unit: 'uses',
    allergyTags: [],
    usageNote: 'Reusable cuff with disposable sanitation wipes; avoid duplicate checks within 60 min.',
  },
  {
    id: 'hms-glucose-strips',
    name: 'Blood glucose test strips & lancets',
    category: 'consumable',
    location: 'Crew Medical Kit A · Metabolic Tray',
    zoneIds: ['metabolism'],
    indicatorIds: ['glucose'],
    defaultRemaining: 14,
    lowThreshold: 6,
    unit: 'strips',
    allergyTags: [],
    usageNote: 'Limited resupply consumable; skip redundant re-tests inside 60 min unless symptomatic shift.',
  },
  {
    id: 'hms-temp-probe-covers',
    name: 'Infrared thermometer probe covers',
    category: 'consumable',
    location: 'Crew Medical Kit B · Triage Drawer',
    zoneIds: ['immune'],
    indicatorIds: ['temperature'],
    defaultRemaining: 5,
    lowThreshold: 5,
    unit: 'covers',
    allergyTags: ['sulfonamides'],
    usageNote: 'Single-use sterile covers (packed with antimicrobial wipe sleeve; check sulfa note).',
  },
  {
    id: 'hms-lumbar-strap',
    name: 'Spinal axial compression / stabilization belt',
    category: 'supportive',
    location: 'ARED Exercise Stowage · Bay 3',
    zoneIds: ['bone'],
    indicatorIds: [],
    defaultRemaining: 3,
    lowThreshold: 1,
    unit: 'belts',
    allergyTags: [],
    usageNote: 'Mechanical musculoskeletal support for microgravity lumbar elongation relief.',
  },
];

const CONSUMABLE_LABEL_BY_INDICATOR: Record<IndicatorId, string> = {
  glucose: 'Blood glucose test strips & lancets',
  temperature: 'Infrared thermometer probe covers',
  heartRate: 'Conductive ECG electrodes / sensor pads',
  bpSystolic: 'Automated BP cuff & alcohol prep swabs',
  bpDiastolic: 'Automated BP cuff & alcohol prep swabs',
  sleepHours: 'Circadian sleep log',
  phq2: 'Private check-in',
};

const CONSUMABLE_INDICATORS = new Set<IndicatorId>([
  'glucose',
  'temperature',
  'heartRate',
  'bpSystolic',
  'bpDiastolic',
]);

/**
 * Detects whether consumable-backed indicators in the target scope were already measured inside
 * a short window (default 60 minutes) so crew can avoid wasting scarce strips, pads, or swabs.
 * Preserves privacy invariants: tier-only indicators (PHQ-2) never surface raw numeric values.
 */
export function detectRedundantMeasurements(params: {
  readings: readonly Reading[];
  asOf: AsOf;
  indicators: readonly Indicator[];
  filterIndicatorIds?: readonly IndicatorId[];
  windowMinutes?: number;
}): readonly RedundantMeasurementWarning[] {
  const { readings, asOf, indicators, filterIndicatorIds, windowMinutes = 60 } = params;
  const allowed = filterIndicatorIds ? new Set(filterIndicatorIds) : null;
  const indMap = new Map(indicators.map((i) => [i.id, i]));

  const latestRecentByInd = new Map<IndicatorId, { reading: Reading; minutesAgo: number }>();

  for (const r of readings) {
    if (!CONSUMABLE_INDICATORS.has(r.indicatorId)) continue;
    if (allowed && !allowed.has(r.indicatorId)) continue;
    const deltaMin = asOf.t - r.t;
    if (deltaMin < 0 || deltaMin > windowMinutes) continue;

    const prev = latestRecentByInd.get(r.indicatorId);
    if (!prev || r.t > prev.reading.t) {
      latestRecentByInd.set(r.indicatorId, { reading: r, minutesAgo: deltaMin });
    }
  }

  const warnings: RedundantMeasurementWarning[] = [];
  for (const [indicatorId, entry] of latestRecentByInd.entries()) {
    const ind = indMap.get(indicatorId);
    if (!ind) continue;
    const valueText =
      ind.privacy === 'tierOnly'
        ? 'Tier recorded'
        : formatValue(entry.reading.value / ind.unitScale, ind);
    const consumableName = CONSUMABLE_LABEL_BY_INDICATOR[indicatorId];

    warnings.push({
      indicatorId,
      indicatorLabel: ind.label,
      minutesAgo: entry.minutesAgo,
      lastValueText: valueText,
      consumableName,
      reason: `Already measured ${entry.minutesAgo === 0 ? 'just now' : `${entry.minutesAgo} min ago`} (${valueText}). Avoid repeating unless urgent triage warrants consuming another unit of ${consumableName}.`,
    });
  }

  return warnings;
}

/**
 * Evaluates HMS stock levels, xEHR allergy conflicts, and duplicate-measurement risks for either
 * a single anatomical zone or the whole spacecraft inventory.
 */
export function evaluateInventoryAndAllergies(params: {
  zoneId: ZoneId | null;
  indicators: readonly Indicator[];
  zoneIndicatorIds?: readonly IndicatorId[];
  readings: readonly Reading[];
  asOf: AsOf;
  allergies: readonly AllergyId[];
  usedCounts: Readonly<Record<string, number>>;
  triagePlan?: TriageProtocolPlan | null;
}): InventoryEvaluation {
  const { zoneId, indicators, zoneIndicatorIds, readings, asOf, allergies, usedCounts, triagePlan } = params;
  const allergyMap = new Map(XHER_ALLERGY_CATALOG.map((a) => [a.id, a]));
  const allergySet = new Set(allergies);
  const catalogById = new Map(HMS_INVENTORY_CATALOG.map((item) => [item.id, item]));

  const relevantCatalog = zoneId
    ? HMS_INVENTORY_CATALOG.filter((item) => item.zoneIds.includes(zoneId))
    : HMS_INVENTORY_CATALOG;

  const items: EvaluatedHmsItem[] = relevantCatalog.map((item) => {
    const used = Math.max(0, usedCounts[item.id] ?? 0);
    const remaining = Math.max(0, item.defaultRemaining - used);
    const stockLevel: StockLevel =
      remaining === 0 ? 'depleted' : remaining <= item.lowThreshold ? 'low' : 'nominal';

    const conflictingAllergies = item.allergyTags
      .filter((tag) => allergySet.has(tag))
      .map((tag) => allergyMap.get(tag)!)
      .filter(Boolean);

    const safeAlternativeName =
      conflictingAllergies.length > 0 && item.alternativeItemId
        ? (catalogById.get(item.alternativeItemId)?.name ?? null)
        : null;

    return {
      ...item,
      remaining,
      stockLevel,
      conflictingAllergies,
      safeAlternativeName,
    };
  });

  const filterIds = zoneId ? zoneIndicatorIds : undefined;
  const redundantChecks = detectRedundantMeasurements({
    readings,
    asOf,
    indicators,
    filterIndicatorIds: filterIds,
  });

  const allergyConflictsCount = items.filter((i) => i.conflictingAllergies.length > 0).length;
  const lowOrDepletedCount = items.filter((i) => i.stockLevel !== 'nominal').length;

  let statusEquivalent: Tier | 'none' = 'none';
  if (allergyConflictsCount > 0 || items.some((i) => i.stockLevel === 'depleted')) {
    statusEquivalent = 'warning';
  } else if (lowOrDepletedCount > 0 || redundantChecks.length > 0) {
    statusEquivalent = 'notice';
  } else if (triagePlan && triagePlan.level !== 'routine') {
    statusEquivalent = 'information';
  }

  const parts: string[] = [];
  if (allergyConflictsCount > 0) {
    parts.push(`${allergyConflictsCount} xEHR allergy conflict${allergyConflictsCount > 1 ? 's' : ''}`);
  }
  if (redundantChecks.length > 0) {
    parts.push(`${redundantChecks.length} recent test (<60 min)`);
  }
  if (lowOrDepletedCount > 0) {
    parts.push(`${lowOrDepletedCount} low/empty kit item${lowOrDepletedCount > 1 ? 's' : ''}`);
  }
  const summary =
    parts.length > 0
      ? parts.join(' · ')
      : `${items.length} HMS kit items nominal · 0 xEHR allergy conflicts`;

  return {
    zoneId,
    items,
    allergyConflictsCount,
    lowOrDepletedCount,
    redundantChecks,
    statusEquivalent,
    summary,
    safeguard: HMS_SAFEGUARD_TEXT,
  };
}
