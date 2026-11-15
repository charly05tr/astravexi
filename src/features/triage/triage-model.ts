import type { ZoneId, ZoneStatus } from '../../core/health/model';
import { hasZoneSymptoms } from '../body-map/symptom-model';
import type { ZoneSymptomReport } from '../body-map/symptom-model';
import type { EnvironmentZoneAssessment } from '../environment/environment-model';

export type TriageAnswer = 'yes' | 'no' | 'unsure';

export type TriageProtocolLevel = 'routine' | 'stabilize' | 'urgent';

export type ReadingMode = 'easy' | 'clinical';

export interface TriageQuestion {
  readonly id: string;
  readonly easyPrompt: string;
  readonly clinicalPrompt: string;
  /** Answer 'yes' increases escalation weight (+urgent or +stabilize, or -1 if it indicates relief). */
  readonly role: 'red-flag' | 'relief' | 'context';
}

export interface AdaptiveTerm {
  readonly plainTerm: string;
  readonly clinicalTerm: string;
  readonly easyExplanation: string;
  readonly clinicalNote: string;
}

export interface TriageProtocolPlan {
  readonly level: TriageProtocolLevel;
  readonly label: string;
  readonly statusEquivalent: ZoneStatus;
  readonly easySummary: string;
  readonly clinicalSummary: string;
  readonly justInTimeSteps: readonly string[];
  readonly glossaryTerms: readonly AdaptiveTerm[];
  readonly unansweredCount: number;
}

export const ZONE_TRIAGE_QUESTIONS: Readonly<Record<ZoneId, readonly TriageQuestion[]>> = {
  brain: [
    {
      id: 'brain-neuro-redflag',
      role: 'red-flag',
      easyPrompt: 'Do you also feel sudden vision blackouts, severe nausea, or trouble speaking clearly?',
      clinicalPrompt: 'Concurrent acute neuro-vestibular deficits, emesis, or focal visual obscurations?',
    },
    {
      id: 'brain-ventilation-relief',
      role: 'relief',
      easyPrompt: 'Does moving near an air vent and resting for 10 minutes ease the head pressure?',
      clinicalPrompt: 'Partial symptom resolution following local airflow increase (suggesting reversible CO2 load)?',
    },
    {
      id: 'brain-sleep-debt',
      role: 'context',
      easyPrompt: 'Have you had less than 5 hours of sleep in the past 24 hours?',
      clinicalPrompt: 'Acute sleep restriction (< 5 h/24 h) compounding neurobehavioral load?',
    },
  ],
  eyes: [
    {
      id: 'eyes-acute-redflag',
      role: 'red-flag',
      easyPrompt: 'Are you noticing sudden flashes of light, dark shadows in your sight, or double vision?',
      clinicalPrompt: 'Acute photopsia, visual field defect, or new diplopia suggestive of progressive ocular shift?',
    },
    {
      id: 'eyes-screen-relief',
      role: 'relief',
      easyPrompt: 'Does close-up blur improve after looking away from screens for 15 minutes?',
      clinicalPrompt: 'Accommodative recovery observed following near-task visual unloading?',
    },
    {
      id: 'eyes-strain-context',
      role: 'context',
      easyPrompt: 'Did eye pressure start or increase shortly after heavy harness exercise?',
      clinicalPrompt: 'Symptom onset temporally coupled to high intrathoracic / resistive exercise loading?',
    },
  ],
  heart: [
    {
      id: 'heart-cardiac-redflag',
      role: 'red-flag',
      easyPrompt: 'Is chest tightness or a racing beat paired with shortness of breath, dizziness, or cold sweat at rest?',
      clinicalPrompt: 'Chest tightness or tachyarrhythmic palpitations accompanied by dyspnea, presyncope, or diaphoresis at rest?',
    },
    {
      id: 'heart-rest-recovery',
      role: 'relief',
      easyPrompt: 'Does your pulse settle after sitting quietly anchored for 5 minutes?',
      clinicalPrompt: 'Autonomic heart-rate recovery confirmed within 5 minutes of seated rest?',
    },
    {
      id: 'heart-fluid-gap',
      role: 'context',
      easyPrompt: 'Have fluid intake or electrolytes been lower than your daily target today?',
      clinicalPrompt: 'Suspected intravascular volume deficit or incomplete post-exercise hydration?',
    },
  ],
  immune: [
    {
      id: 'immune-sepsis-redflag',
      role: 'red-flag',
      easyPrompt: 'Do warmth or chills come with shortness of breath, stiff neck, or confusion?',
      clinicalPrompt: 'Febrile trend accompanied by dyspnea, meningismus, or systemic malaise?',
    },
    {
      id: 'immune-superficial-relief',
      role: 'relief',
      easyPrompt: 'Is the discomfort limited to mild skin irritation or a stuffy nose with normal energy?',
      clinicalPrompt: 'Localized mucocutaneous irritation without systemic hemodynamic or febrile escalation?',
    },
  ],
  metabolism: [
    {
      id: 'metab-intake-redflag',
      role: 'red-flag',
      easyPrompt: 'Are nausea or shakiness keeping you from sipping water or eating simple carbohydrates?',
      clinicalPrompt: 'Oral intolerance preventing enteral hydration or rapid glucose correction?',
    },
    {
      id: 'metab-fasting-gap',
      role: 'context',
      easyPrompt: 'Has it been more than 4 hours since your last balanced snack or meal?',
      clinicalPrompt: 'Extended inter-prandial fasting interval prior to metabolic symptom onset?',
    },
  ],
  bone: [
    {
      id: 'bone-radicular-redflag',
      role: 'red-flag',
      easyPrompt: 'Does back or joint pain shoot down a leg with numbness, tingling, or new weakness?',
      clinicalPrompt: 'Radicular pain distribution paired with paresthesia or focal motor deficit?',
    },
    {
      id: 'bone-loading-relief',
      role: 'relief',
      easyPrompt: 'Does gentle knee-to-chest floating ease the ache without sharp spikes?',
      clinicalPrompt: 'Mechanical unloading posture provides reproducible relief of axial elongation discomfort?',
    },
  ],
};

export const ZONE_GLOSSARY: Readonly<Record<ZoneId, readonly AdaptiveTerm[]>> = {
  brain: [
    {
      plainTerm: 'Short sleep or heavy head',
      clinicalTerm: 'CO2 sensitivity & sleep debt',
      easyExplanation: 'Stale cabin air or short sleep can slow reaction time and cause head pressure.',
      clinicalNote: 'Hypercapnia (>= 3.0 mmHg) combined with < 6 h sleep lowers cognitive throughput and vigilance.',
    },
  ],
  eyes: [
    {
      plainTerm: 'Close-up blur in low gravity',
      clinicalTerm: 'SANS cephalad fluid shift',
      easyExplanation: 'Without gravity pulling fluids down, gentle fluid pressure near the back of the eyes can shift focus.',
      clinicalNote: 'Spaceflight-Associated Neuro-ocular Syndrome (SANS): monitor hyperopic shift, globe flattening, and disc edema.',
    },
  ],
  heart: [
    {
      plainTerm: 'Heart beating faster than normal',
      clinicalTerm: 'Tachycardia / elevated resting HR',
      easyExplanation: 'Your heart is working a bit harder than your usual calm pace, often due to fluids, heat, or strain.',
      clinicalNote: 'Sustained resting HR elevation >= 15% above lagged baseline or symptomatic tachycardia requires re-measure.',
    },
    {
      plainTerm: 'Higher blood pressure reading',
      clinicalTerm: 'Stage 2 / hypertensive excursion',
      easyExplanation: 'Pressure inside your vessels read higher than safe resting limits; calm rest and a fresh check confirm the trend.',
      clinicalNote: 'Evaluate repeated resting cuff measurements against flight surgeon escalation cutoffs (180/120 mmHg).',
    },
  ],
  immune: [
    {
      plainTerm: 'Higher body warmth in space',
      clinicalTerm: 'Microgravity core temperature shift (+1 C)',
      easyExplanation: 'Body heat dissipates more slowly in weightlessness, so baseline temperature naturally sits slightly warmer.',
      clinicalNote: 'Distinguish expected ~1 C orbital thermoregulatory shift (Stahn et al.) from symptomatic febrile drift.',
    },
  ],
  metabolism: [
    {
      plainTerm: 'Low energy or shaky feeling',
      clinicalTerm: 'Hypoglycemic trend / fasting drift',
      easyExplanation: 'Fuel levels may be running low between meals; a small steady carb and protein snack helps rebalance safely.',
      clinicalNote: 'Cross-check capillary fasting glucose trend (< 70 mg/dL or neuroglycopenic symptoms) before heavy tasks.',
    },
  ],
  bone: [
    {
      plainTerm: 'Lower back tightness',
      clinicalTerm: 'Microgravity spinal elongation',
      easyExplanation: 'In zero gravity the spine gently stretches out, which commonly causes a dull ache in the lower back.',
      clinicalNote: 'Unloaded intervertebral disc expansion (~4–7 cm) plus resistive ARED harness strain; screen radiculopathy.',
    },
  ],
};

export interface EvaluateTriageInput {
  readonly zoneId: ZoneId;
  readonly zoneStatus: ZoneStatus;
  readonly symptomReport: ZoneSymptomReport;
  readonly envAssessment: EnvironmentZoneAssessment | null;
  readonly answers: Readonly<Record<string, TriageAnswer>>;
}

/**
 * Evaluates differential Yes/No answers alongside physiological status, symptom severity,
 * and environmental attribution to recommend an actionable Just-in-Time triage protocol.
 */
export function evaluateGuidedTriage(input: EvaluateTriageInput): TriageProtocolPlan {
  const { zoneId, zoneStatus, symptomReport, envAssessment, answers } = input;
  const questions = ZONE_TRIAGE_QUESTIONS[zoneId];
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const unansweredCount = questions.length - answeredCount;

  const hasRedFlagYes = questions.some((q) => q.role === 'red-flag' && answers[q.id] === 'yes');
  const hasReliefYes = questions.some((q) => q.role === 'relief' && answers[q.id] === 'yes');
  const hasContextYes = questions.some((q) => q.role === 'context' && answers[q.id] === 'yes');

  const hasSymptoms = hasZoneSymptoms(symptomReport);
  const severeDiscomfort = symptomReport.discomfort >= 8 || symptomReport.tags.includes('chest-tightness');
  const moderateSignal =
    zoneStatus === 'caution' ||
    zoneStatus === 'notice' ||
    (hasSymptoms && symptomReport.discomfort >= 4) ||
    envAssessment?.attribution === 'mixed' ||
    envAssessment?.attribution === 'environmental';

  const stepsByZone: Readonly<Record<ZoneId, Readonly<Record<TriageProtocolLevel, readonly string[]>>>> = {
    brain: {
      routine: ['Keep a calm breathing pace and finish current low-demand checklists.', 'Maintain hydration and protect tonight’s sleep block.'],
      stabilize: ['Move to high-airflow ventilation or switch on portable cabin duct fan.', 'Drink 300 ml water and dim overhead lights for 20 minutes before recheck.'],
      urgent: ['Stop precision/EVA tasks immediately and alert a crewmate.', 'Log vitals (HR, BP, temperature) and initiate Crew Medical Officer review in Comms.'],
    },
    eyes: {
      routine: ['Take 20-20 visual breaks away from bright displays.', 'Keep preservative-free drops handy if cabin air feels dry.'],
      stabilize: ['Increase console font contrast and avoid straining / breath-holding lifts.', 'Rest torso aligned calmly and repeat visual acuity check in 4 hours.'],
      urgent: ['Pause display/console work immediately.', 'Document field symptoms and trigger CMO & Earth flight-surgeon notification in Comms.'],
    },
    heart: {
      routine: ['Maintain steady fluid + electrolyte intake across active hours.', 'Warm up gradually before scheduled SPRINT / ARED blocks.'],
      stabilize: ['Sit/recline anchored quietly for 5 minutes and repeat resting HR & blood pressure.', 'Replenish 350 ml electrolyte water before resuming moderate work.'],
      urgent: ['Cease all exertion immediately and stay with a crewmate nearby.', 'Capture resting BP/HR/temp pair right away and escalate urgently to CMO in Comms.'],
    },
    immune: {
      routine: ['Continue normal hygiene wipes and scheduled fluid intake.', 'Recheck core temperature only at your next planned check-in.'],
      stabilize: ['Measure oral/tympanic temperature after 10 min without hot/cold drinks.', 'Prioritize sheltered rest if radiation/SPE alerts are active.'],
      urgent: ['Isolate shared contact surfaces, stay hydrated, and rest continuously.', 'Trigger CMO triage in Comms with updated resting temperature & symptoms.'],
    },
    metabolism: {
      routine: ['Keep evenly spaced complex carb + protein snacks during shift blocks.', 'Record water pouch intake steadily across the day.'],
      stabilize: ['Eat a 15–20 g complex carbohydrate + protein snack now.', 'Pause heavy exertion 15 minutes and log your next glucose reading.'],
      urgent: ['Keep airway upright, sip small glucose solution if tolerated, stay accompanied.', 'Notify CMO immediately via Comms for acute metabolic escalation.'],
    },
    bone: {
      routine: ['Alternate seated console blocks with 2-minute floating mobility breaks.', 'Verify ARED harness cushion alignment before next session.'],
      stabilize: ['Use gentle knee-to-chest spinal unloading posture for 5–10 minutes.', 'Reduce axial harness resistance today while discomfort settles.'],
      urgent: ['Unload spine completely and avoid twisting or resistive loading.', 'Report radiating nerve/motor symptoms promptly to CMO in Comms.'],
    },
  };

  let level: TriageProtocolLevel = 'routine';
  if (hasRedFlagYes || zoneStatus === 'warning' || (severeDiscomfort && !hasReliefYes)) {
    level = 'urgent';
  } else if (moderateSignal || hasContextYes || (hasSymptoms && !hasReliefYes)) {
    level = 'stabilize';
  }

  const labelMap: Record<TriageProtocolLevel, { label: string; status: ZoneStatus; easy: string; clinical: string }> = {
    routine: {
      label: 'Routine check & self-care',
      status: 'none',
      easy: 'No urgent warning signs turned up. Simple everyday steps are enough right now.',
      clinical: 'Differential screening negative for red flags; continue routine preventive monitoring.',
    },
    stabilize: {
      label: 'Stabilize & recheck',
      status: 'caution',
      easy: 'Your answers or cabin context suggest slowing down briefly, adjusting your environment, and rechecking.',
      clinical: 'Moderate drift or habitat strain without acute red flags; apply targeted mitigation before re-evaluation.',
    },
    urgent: {
      label: 'Urgent CMO escalation',
      status: 'warning',
      easy: 'Important warning signs need a second pair of eyes right away. Stop heavy work and contact the Crew Medical Officer.',
      clinical: 'Positive red-flag screen or Warning physiological state; initiate immediate CMO review and Comms escalation.',
    },
  };

  const chosen = labelMap[level];
  return {
    level,
    label: chosen.label,
    statusEquivalent: chosen.status,
    easySummary: chosen.easy,
    clinicalSummary: chosen.clinical,
    justInTimeSteps: stepsByZone[zoneId][level],
    glossaryTerms: ZONE_GLOSSARY[zoneId],
    unansweredCount,
  };
}
