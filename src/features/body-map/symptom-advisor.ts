import type { IndicatorId, RecommendationDecision, ZoneId, ZoneStatus } from '../../core/health/model';
import type { Suggestion } from '../../core/ports';
import type { IndicatorView, ZonePanelModel } from '../insights/zone-panel-model';
import { ZONE_SYMPTOMS, hasZoneSymptoms } from './symptom-model';
import type { ZoneSymptomReport } from './symptom-model';

export interface CabinEnvironmentContext {
  missionDay: number;
  co2Ppm: number;
  humidityPct: number;
  temperatureC: number;
  radiationMsvDay: number;
}

/**
 * Deterministic simulated habitat telemetry (ISS / Deep-space transit) keyed by mission day.
 * Feeds the simulated LLM recommendation alongside zone statistics and reported symptoms.
 */
export function getCabinEnvironmentContext(missionDay: number): CabinEnvironmentContext {
  const wave = Math.sin(missionDay * 0.45);
  return {
    missionDay,
    co2Ppm: Math.round(2950 + wave * 320),
    humidityPct: Math.round(39 - wave * 3),
    temperatureC: Number((22.8 + wave * 0.4).toFixed(1)),
    radiationMsvDay: Number((0.52 + Math.cos(missionDay * 0.3) * 0.05).toFixed(2)),
  };
}

interface SymptomPlaybook {
  title: string;
  steps: readonly string[];
}

const SYMPTOM_PLAYBOOK: Readonly<Record<string, SymptomPlaybook>> = {
  'co2-headache': {
    title: 'Boost local airflow & pause high-focus tasks',
    steps: [
      'Move near a primary cabin duct or verify portable ventilation fan flow.',
      'Drink 300 ml of water over the next 20 minutes and dim overhead lighting.',
      'Re-assess headache intensity in 30 minutes before continuing complex procedures.',
    ],
  },
  'cognitive-fog': {
    title: 'Protect recovery block & shift low-demand tasks',
    steps: [
      'Move precision-critical tasks out of the next work block if safe to defer.',
      'Use bright blue-enriched task light only during scheduled wake hours.',
      'Log sleep timing cleanly tonight to stabilize your 7-day baseline.',
    ],
  },
  'vestibular-vertigo': {
    title: 'Anchor gaze & slow head rotations',
    steps: [
      'Use handrail contact points and avoid rapid pitch/roll head movements.',
      'Pause screen-heavy work for 20 minutes while fixating on a stationary bulkhead reference.',
      'Notify your crewmate before moving through translation hatches.',
    ],
  },
  'near-blur': {
    title: 'Reduce close-focus strain & log SANS check',
    steps: [
      'Increase font scale by +15% and switch consoles to lower glare contrast.',
      'Follow 20-20 visual breaks between extended display sessions.',
      'Schedule an onboard visual acuity / Amsler check if blur persists past 24 hours.',
    ],
  },
  'retro-orbital': {
    title: 'Elevate torso alignment & limit straining',
    steps: [
      'Avoid breath-holding Valsalva efforts during heavy resistive harness sets today.',
      'Rest in a semi-upright restraint angle to ease cephalad fluid pressure.',
      'Flag persistent behind-eye pressure for CMO / flight surgeon review.',
    ],
  },
  'dry-irritation': {
    title: 'Rehydrate ocular surface & step away from vents',
    steps: [
      'Step out of direct high-velocity cabin fan airstreams.',
      'Apply sterile preservative-free ophthalmic drops per onboard kit protocol.',
      'Blink consciously during prolonged checklist and telemetry reads.',
    ],
  },
  palpitations: {
    title: 'Rest seated/reclined & log resting pulse',
    steps: [
      'Stop aerobic/resistive exercise for the remainder of the current shift.',
      'Take a fresh resting heart rate and blood pressure pair after 5 quiet minutes.',
      'Hydrate with an electrolyte packet if fluid intake has lagged behind target.',
    ],
  },
  'orthostatic-lightheaded': {
    title: 'Pause upright transfers & replenish sodium/fluids',
    steps: [
      'Remain anchored at rest until lightheadedness settles.',
      'Drink 400 ml electrolyte solution prior to the next exercise block.',
      'Perform calf/thigh muscle pumps before releasing foot restraints.',
    ],
  },
  'chest-tightness': {
    title: 'Cease exertion immediately & prep CMO triage',
    steps: [
      'Stop physical activity right away and remain rested with a crewmate nearby.',
      'Capture resting heart rate, blood pressure, and temperature measurements.',
      'Treat chest discomfort as high priority for CMO / ground medical review.',
    ],
  },
  'chills-warmth': {
    title: 'Verify core temperature & hydrate calmly',
    steps: [
      'Measure oral/tympanic temperature after 10 minutes away from hot/cold drinks.',
      'Monitor for rising fever trend relative to the +1 C microgravity baseline shift.',
      'Adjust thermal underwear layer and keep steady fluid intake.',
    ],
  },
  'skin-rash': {
    title: 'Switch to clean wipe hygiene & loose layer',
    steps: [
      'Gently cleanse and dry the area using sterile non-fragranced wipes.',
      'Wear loose breathable cotton base clothing over irritated skin.',
      'Avoid applying unapproved topical creams until CMO confirms.',
    ],
  },
  'nasal-congestion': {
    title: 'Clear upper airway & moderate evening fluid shift',
    steps: [
      'Use isotonic saline nasal rinse from the medical kit before sleep.',
      'Inspect nearby vent filters for particulate buildup if cabin air feels dry.',
      'Keep upper torso slightly cushioned during sleep restraint.',
    ],
  },
  'low-energy-shaky': {
    title: 'Take balanced carb + protein snack & recheck',
    steps: [
      'Consume a 15–20 g complex carbohydrate snack paired with protein.',
      'Pause strenuous EVA/ARED prep for 15 minutes until energy stabilizes.',
      'Record your next pre-meal glucose reading for trend comparison.',
    ],
  },
  'thirst-dry-mouth': {
    title: 'Rebalance scheduled water intake',
    steps: [
      'Sip 350 ml water across the next 30 minutes rather than all at once.',
      'Track total fluid pouches logged since wake-up.',
      'Check ambient humidity alongside urine concentration cues.',
    ],
  },
  'nausea-appetite': {
    title: 'Choose bland small portions & avoid strong odors',
    steps: [
      'Prioritize plain crackers or broth pouches in small spaced sips.',
      'Avoid vigorous spinning or rapid posture changes immediately after eating.',
      'Inform the crew if nausea prevents keeping fluids down over 12 hours.',
    ],
  },
  'lower-back-ache': {
    title: 'Decompress lumbar curve & stretch gently',
    steps: [
      'Use knee-to-chest decompression posture in crew quarters for 5–10 minutes.',
      'Check ARED harness pad alignment before your next resistive session.',
      'Alternate static seated console blocks with brief gentle mobility breaks.',
    ],
  },
  'joint-harness-soreness': {
    title: 'Deload affected joint & inspect harness fit',
    steps: [
      'Reduce resistive load on the symptomatic joint during today’s exercise slot.',
      'Re-check strap symmetry and padding clearance on T2 / ARED restraints.',
      'Apply brief cold pack compression post-workout if mild swelling is present.',
    ],
  },
  'flank-discomfort': {
    title: 'Increase hydration & escalate persistent flank pain',
    steps: [
      'Increase clean water intake immediately to support renal clearance in microgravity.',
      'Avoid heavy axial loading until flank discomfort resolves.',
      'Notify CMO promptly if sharp or radiating flank pain persists.',
    ],
  },
};

const ZONE_FALLBACK_PLAYBOOK: Readonly<Record<ZoneId, SymptomPlaybook>> = {
  brain: {
    title: 'Ease cognitive load & stabilize sleep window',
    steps: [
      'Reduce discretionary screen stimulation for the next 60 minutes.',
      'Keep hydration steady and track symptoms alongside tonight’s sleep duration.',
    ],
  },
  eyes: {
    title: 'Rest close-focus vision & monitor fluid shift',
    steps: [
      'Take periodic gaze breaks away from near cabin displays.',
      'Log recurring visual discomfort for scheduled ocular check.',
    ],
  },
  heart: {
    title: 'Pace exertion & capture resting vitals',
    steps: [
      'Pause high-intensity exercise and sit/recline comfortably for 5 minutes.',
      'Measure heart rate and blood pressure for your personal baseline.',
    ],
  },
  immune: {
    title: 'Monitor thermal comfort & limit cross-contact',
    steps: [
      'Re-check core temperature later in the shift.',
      'Sanitize shared surfaces and prioritize hydration and rest.',
    ],
  },
  metabolism: {
    title: 'Stabilize small meals & fluid balance',
    steps: [
      'Space smaller balanced snacks evenly across active work hours.',
      'Log hydration pouches and next fasting glucose check.',
    ],
  },
  bone: {
    title: 'Gentle spinal unloading & adjust harness load',
    steps: [
      'Spend 5 minutes in gentle flexed unloading posture.',
      'Dial back heavy axial harness resistance if discomfort exceeds 4/10.',
    ],
  },
};

function summarizeStatisticalContext(
  status: ZoneStatus,
  indicators: readonly IndicatorView[],
  findingsCount: number,
  indicatorLabelLookup?: ReadonlyMap<IndicatorId, string>,
): string {
  void indicatorLabelLookup;
  if (indicators.length === 0) {
    return 'Statistical baseline: Unmonitored organ zone in telemetry — guided by symptom intake & habitat trend.';
  }
  const primary = indicators.find((i) => i.last !== null) ?? indicators[0]!;
  const latest = primary.last ? `${primary.label}: ${primary.last.text}` : `${primary.label}: no recent reading`;
  const baselinePart =
    primary.trend.baseline !== null ? ` (baseline ${primary.trend.baseline} ${primary.unit})` : '';
  const findingsPart = findingsCount > 0 ? ` · ${findingsCount} active finding${findingsCount > 1 ? 's' : ''}` : '';
  return `Statistical baseline: ${latest}${baselinePart} · zone status ${status}${findingsPart}.`;
}

export interface SymptomLlmInput {
  model: ZonePanelModel;
  symptomReport: ZoneSymptomReport;
  missionDay: number;
  decisions: readonly RecommendationDecision[];
}

/**
 * Generates an LLM-simulated routine change suggestion whenever an astronaut logs localized symptoms,
 * synthesizing: (1) Astronaut symptom, (2) Statistical indicator/baseline context, and (3) Cabin environment.
 */
export function buildSymptomLlmSuggestions(input: SymptomLlmInput): Suggestion[] {
  const { model, symptomReport, missionDay, decisions } = input;
  if (!hasZoneSymptoms(symptomReport)) return [];

  const zoneOptions = ZONE_SYMPTOMS[model.zoneId];
  const matchedLabels = symptomReport.tags
    .map((id) => zoneOptions.find((o) => o.id === id)?.label)
    .filter((v): v is string => Boolean(v));

  const primaryTag = symptomReport.tags[0];
  const playbook = (primaryTag ? SYMPTOM_PLAYBOOK[primaryTag] : undefined) ?? ZONE_FALLBACK_PLAYBOOK[model.zoneId];
  const id = `llm-symptom-${model.zoneId}-${[...symptomReport.tags].sort().join('_') || 'discomfort'}-${symptomReport.discomfort >= 6 ? 'high' : 'std'}`;
  const findingKey = `symptom:${model.zoneId}`;

  const matchingDecisions = decisions.filter((d) => d.recommendationId === id && d.findingKey === findingKey);
  if (matchingDecisions.some((d) => d.decision === 'dismissed')) return [];

  const env = getCabinEnvironmentContext(missionDay);
  const symptomSummaryText = [
    matchedLabels.length > 0 ? matchedLabels.join(', ') : `${model.label} discomfort`,
    symptomReport.discomfort > 0 ? `discomfort ${symptomReport.discomfort}/10` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const statsSummary = summarizeStatisticalContext(model.status, model.indicators, model.findings.length);
  const envSummary = `Cabin environment: CO2 ${env.co2Ppm} ppm · Humidity ${env.humidityPct}% · Temp ${env.temperatureC} C · Radiation ${env.radiationMsvDay} mSv/day (Day ${env.missionDay}).`;

  const steps =
    symptomReport.discomfort >= 6
      ? [...playbook.steps, 'High discomfort (>=6/10): avoid solo heavy tasks and alert Crew Medical Officer if symptoms persist.']
      : playbook.steps;

  return [
    {
      id,
      findingKey,
      title: playbook.title,
      steps,
      rationale: `Symptom (${symptomSummaryText}) + ${statsSummary} + ${envSummary}`,
      rationales: [
        `Reported symptom: ${symptomSummaryText}.`,
        statsSummary,
        envSummary,
      ],
      evidence: {
        label: 'Simulated LLM triage (environment + statistical baseline + symptom)',
        url: '',
        kind: 'design-inference',
      },
      needsVerification: true,
      origin: 'llm',
      ...(matchingDecisions.some((d) => d.decision === 'accepted') ? { decision: 'accepted' as const } : {}),
    },
  ];
}
