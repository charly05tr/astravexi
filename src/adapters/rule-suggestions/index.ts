import type { Recommendation } from '../../core/health/model';
import type { Suggestion, SuggestionContext, SuggestionProvider } from '../../core/ports';

/**
 * Curated suggestions: each finding gets the recommendations the knowledge base links to it. Dismissed
 * pairs are dropped (logged, then removed) and accepted pairs come back marked as accepted.
 */
export function createRuleSuggestionProvider(recommendations: ReadonlyMap<string, Recommendation>): SuggestionProvider {
  return {
    id: 'rules',
    suggest(context: SuggestionContext): Promise<Suggestion[]> {
      const out: Suggestion[] = [];
      for (const finding of context.findings) {
        for (const id of finding.recommendationIds) {
          const rec = recommendations.get(id);
          if (!rec) continue;
          const made = context.decisions.filter((d) => d.recommendationId === id && d.findingKey === finding.key);
          if (made.some((d) => d.decision === 'dismissed')) continue;
          out.push({
            id: rec.id,
            findingKey: finding.key,
            title: rec.title,
            steps: rec.steps,
            rationale: `${finding.indicatorLabel}: ${finding.whatChanged}`,
            evidence: rec.evidence,
            needsVerification: rec.needsVerification,
            origin: 'rules',
            ...(made.some((d) => d.decision === 'accepted') ? { decision: 'accepted' as const } : {}),
          });
        }
      }
      return Promise.resolve(out);
    },
  };
}
