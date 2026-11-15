import { FollowUpError } from '../../core/follow-up/errors';
import type { AiModelCatalog, AiSettings } from '../../core/ports';
import { isGeminiBaseUrl } from './config';
import { httpError, readErrorDetail } from './status';

/** Flash by name but not a general text model, or the cut-down tier. */
const NOT_TEXT = /lite|image|tts|audio|live|embedding|imagen|veo|aqa/i;
const PRE_RELEASE = /preview|exp/i;

const versionOf = (id: string): number => {
  const match = /gemini-(\d+(?:\.\d+)?)/i.exec(id);
  return match ? Number(match[1]) : Number.NaN;
};

/**
 * The model to select after a successful listing: the newest stable flash that is not lite (fast enough for
 * an interactive follow-up, deeper than lite). A stable release beats a preview of the same version. When no
 * flash model exists (a local server), the first listed model wins.
 */
export function pickDefaultModel(models: readonly string[]): string | null {
  if (models.length === 0) return null;
  const flash = models.filter((m) => /flash/i.test(m) && !NOT_TEXT.test(m));
  if (flash.length === 0) return models[0]!;
  const rank = (m: string) => (Number.isNaN(versionOf(m)) ? -1 : versionOf(m));
  return [...flash].sort((a, b) => rank(b) - rank(a) || Number(PRE_RELEASE.test(a)) - Number(PRE_RELEASE.test(b)))[0]!;
}

const endpoint = (baseUrl: string) => `${baseUrl.trim().replace(/\/+$/, '')}/models`;

/** OpenAI-style `{data:[{id}]}`; Gemini ids may come as `models/<id>`. */
function idsOf(body: unknown): string[] {
  const rows = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const ids: string[] = [];
  for (const row of rows) {
    const id = (row as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && id.trim() !== '') ids.push(id.replace(/^models\//, ''));
  }
  return ids;
}

export function createAiModelCatalog(options: { fetch?: typeof fetch } = {}): AiModelCatalog {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  return {
    pickDefault: pickDefaultModel,
    async listModels(settings: Pick<AiSettings, 'apiKey' | 'baseUrl'>, call) {
      let res: Response;
      try {
        res = await doFetch(endpoint(settings.baseUrl), {
          headers: { Authorization: `Bearer ${settings.apiKey.trim()}` },
          signal: call?.signal,
        });
      } catch {
        if (call?.signal?.aborted) throw new FollowUpError('aborted', 'The request was cancelled.');
        throw new FollowUpError('network', 'The AI service could not be reached. Check your connection and the base URL.');
      }
      if (!res.ok) throw httpError(res.status, await readErrorDetail(res));
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new FollowUpError('invalid', 'The AI service returned a model list that could not be read.');
      }
      const all = idsOf(body);
      // Hosted Gemini also lists embedding, image and audio models: keep the text ones.
      return isGeminiBaseUrl(settings.baseUrl) ? all.filter((id) => /^gemini/i.test(id) && !/embedding|imagen|veo|aqa/i.test(id)) : all;
    },
  };
}
