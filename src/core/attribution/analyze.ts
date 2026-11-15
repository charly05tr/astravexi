import type { Indicator, IndicatorId, MissionDay, Reading } from '../health/model';
import { assessCrewCooccurrence } from './crew-cooccurrence';
import type { CrewCooccurrence, PeerSignal } from './crew-cooccurrence';
import { assessEnvironmentLink } from './environment-link';
import type { EnvironmentLink } from './environment-link';
import type { CabinKnowledge, CabinSample, Verdict, VerdictReason } from './model';
import { assessPersonalDeviation } from './personal-deviation';
import type { PersonalDeviation, SeriesPoint } from './personal-deviation';
import { decideVerdict } from './verdict';

export interface AnalysisMember {
  profileId: string;
  name: string;
  readings: readonly Reading[];
}

export interface AnalysisInput {
  members: readonly AnalysisMember[];
  indicators: readonly Indicator[];
  cabin: CabinKnowledge;
  /** Simulated cabin samples covering the analysed span and the longest lag before it. Null: no cabin data (LIVE). */
  samples: readonly CabinSample[] | null;
  /** Only readings with `fromT <= t <= toT` are judged; earlier ones still feed the baselines. */
  fromT: number;
  toT: number;
}

/** One atypical reading with its verdict and the three signals behind it. */
export interface AttributedReading {
  id: string;
  profileId: string;
  name: string;
  indicatorId: IndicatorId;
  indicatorLabel: string;
  unit: string;
  readingId: string;
  t: number;
  day: MissionDay;
  /** Display units. */
  value: number;
  verdict: Verdict;
  reason: VerdictReason;
  /** Always status 'outlier'. */
  personal: Exclude<PersonalDeviation, { status: 'insufficient-baseline' }>;
  crew: CrewCooccurrence;
  environment: EnvironmentLink;
}

export interface CabinCrewAnalysis {
  /** Newest first. */
  findings: AttributedReading[];
  /** Readings that could not be judged because the person has too little history for that indicator. */
  withoutBaseline: number;
  membersAnalyzed: number;
}

interface Point extends SeriesPoint {
  reading: Reading;
}

function seriesOf(member: AnalysisMember, indicator: Indicator): Point[] {
  return member.readings
    .filter((r) => r.indicatorId === indicator.id && (!indicator.contextAware || r.context === 'rest'))
    .map((r) => ({ t: r.t, value: r.value / indicator.unitScale, reading: r }))
    .sort((a, b) => a.t - b.t);
}

/**
 * For every reading of every crew member in the span, asks three questions: is it atypical for THIS person, did
 * the rest of the crew move the same way in the same window, and was a cabin variable with a documented link to
 * that indicator outside its NASA limit just before. Only atypical readings are returned.
 */
export function analyzeCabinAndCrew(input: AnalysisInput): CabinCrewAnalysis {
  const { config } = input.cabin;
  const findings: AttributedReading[] = [];
  let withoutBaseline = 0;

  for (const indicator of input.indicators) {
    const floor = config.spreadFloor[indicator.id];
    const byMember = new Map(input.members.map((m) => [m.profileId, seriesOf(m, indicator)] as const));
    for (const member of input.members) {
      const series = byMember.get(member.profileId)!;
      for (const point of series) {
        if (point.t < input.fromT || point.t > input.toT) continue;
        const personal = assessPersonalDeviation(series, point, config, floor);
        if (personal.status === 'insufficient-baseline') {
          withoutBaseline += 1;
          continue;
        }
        if (personal.status !== 'outlier') continue;

        const peers: PeerSignal[] = input.members
          .filter((m) => m.profileId !== member.profileId)
          .map((peer) => {
            const theirs = byMember.get(peer.profileId)!;
            let nearest: Point | null = null;
            for (const p of theirs) {
              if (Math.abs(p.t - point.t) <= config.crewWindowMin && (!nearest || Math.abs(p.t - point.t) < Math.abs(nearest.t - point.t))) nearest = p;
            }
            return {
              profileId: peer.profileId,
              name: peer.name,
              deviation: nearest ? assessPersonalDeviation(theirs, nearest, config, floor) : null,
            };
          });
        const crew = assessCrewCooccurrence(personal.z, peers, config);
        const direction = personal.direction === 'below' ? 'below' : 'above';
        const environment = assessEnvironmentLink(indicator.id, point.t, direction, input.samples, input.cabin);
        const { verdict, reason } = decideVerdict(personal, crew, environment);
        findings.push({
          id: `${member.profileId}:${point.reading.id}`,
          profileId: member.profileId,
          name: member.name,
          indicatorId: indicator.id,
          indicatorLabel: indicator.label,
          unit: indicator.unit,
          readingId: point.reading.id,
          t: point.t,
          day: point.reading.day,
          value: point.value,
          verdict,
          reason,
          personal,
          crew,
          environment,
        });
      }
    }
  }
  findings.sort((a, b) => b.t - a.t || a.name.localeCompare(b.name) || a.indicatorId.localeCompare(b.indicatorId));
  return { findings, withoutBaseline, membersAnalyzed: input.members.length };
}
