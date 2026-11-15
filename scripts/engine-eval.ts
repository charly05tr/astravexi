// Runs the attribution engine evaluation and writes reports/engine-eval/results.json and summary.md.
// Usage: pnpm eval:engine              regenerate the committed report
//        pnpm eval:engine -- --check   re-run ALL scenarios in memory and fail if results.json differs (no files written)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildResults } from '../src/eval/results';
import type { EvalResults } from '../src/eval/results';
import { renderSummary } from '../src/eval/summary-md';

const OUT_DIR = join('reports', 'engine-eval');

export async function main(args: string[] = []): Promise<void> {
  const started = performance.now();
  if (args.includes('--check')) {
    const committed = JSON.parse(await readFile(join(OUT_DIR, 'results.json'), 'utf8')) as EvalResults;
    const fresh = await buildResults(committed.generatedOn);
    const same = JSON.stringify(fresh) === JSON.stringify(committed);
    console.log(fresh.sentence);
    console.log(same ? 'OK: a full re-run reproduces results.json exactly.' : 'MISMATCH: a full re-run differs from results.json.');
    if (!same) throw new Error('Evaluation is not reproducible from the committed report.');
    return;
  }
  const results = await buildResults(new Date().toISOString().slice(0, 10));
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'results.json'), `${JSON.stringify(results, null, 1)}
`, 'utf8');
  await writeFile(join(OUT_DIR, 'summary.md'), renderSummary(results), 'utf8');
  console.log(results.sentence);
  console.log(`Wrote ${OUT_DIR}/results.json and ${OUT_DIR}/summary.md in ${((performance.now() - started) / 1000).toFixed(1)} s`);
}
