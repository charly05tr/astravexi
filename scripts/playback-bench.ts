// Mission playback: what the engine shows for each showcase event, and how long one recompute takes.
// Usage: node scripts/run-ts.mjs scripts/playback-bench.ts [--events] [--bench]
import { createActiveProfile } from '../src/adapters/active-profile';
import { REASON_CLASS } from '../src/eval/scenario-instance';
import type { VerdictReason } from '../src/core/attribution/model';
import { createProfileSession } from '../src/app/boot';
import { composeAdapters } from '../src/app/composition-root';
import { loadDemoScenario } from '../src/app/demo/demo-scenario';
import { activeProfileKey } from '../src/app/mode';
import { createAppStore } from '../src/app/store/app-store';
import { missionTimeLabel, PLAYBACK_SPEEDS } from '../src/core/playback/timeline';
import { createTestWorld } from '../src/test-support/compose';

async function openShowcase() {
  const world = createTestWorld();
  const scenario = loadDemoScenario('showcase')!;
  const session = await createProfileSession('demo', {
    ...world.options,
    scenario,
    activeProfile: createActiveProfile(undefined, activeProfileKey('demo')),
  });
  const cmo = (await session.services.profiles.list()).find((p) => p.role === 'cmo')!;
  const adapters = await composeAdapters('demo', cmo, { ...world.options, profiles: session.services.profiles, scenario });
  const store = createAppStore(adapters);
  await store.getState().hydrate();
  if (adapters.mode !== 'demo' || !adapters.playback) throw new Error('playback expected');
  return { scenario, store, playback: adapters.playback };
}

export async function main(args: string[] = []): Promise<void> {
  const { scenario, store, playback } = await openShowcase();
  const { span } = playback;

  if (args.includes('--events') || args.length === 0) {
    for (const ev of span.events) {
      await playback.seek(ev.endT + 60);
      const view = await store.getState().loadCabinAnalysis();
      const mine = view.analysis.findings.filter((f) => f.t >= ev.startT && f.t < ev.endT + 60);
      const cabin = view.variables.map((v) => `${v.def.id}=${v.latest} (${v.status})`).join(', ');
      console.log(`\n${ev.name} [${ev.truth}] ${missionTimeLabel(ev.startT)} -> ${missionTimeLabel(ev.endT)}; checked at ${missionTimeLabel(ev.endT + 60)}`);
      console.log(`  cabin: ${cabin}`);
      for (const f of mine) console.log(`  ${f.name} ${f.indicatorId} @ ${missionTimeLabel(f.t)}: ${f.verdict} / ${f.reason} -> ${REASON_CLASS[f.reason as VerdictReason]}`);
    }
  }

  if (args.includes('--bench')) {
    const at = span.endT;
    // One recompute at the largest t: commit (re-hydrate the session) plus the cabin analysis (the heaviest view).
    const runs: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const t0 = performance.now();
      await playback.seek(at - i);
      await store.getState().loadCabinAnalysis();
      runs.push(performance.now() - t0);
    }
    const crew: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const t0 = performance.now();
      await playback.seek(at - i);
      await store.getState().loadCrew();
      crew.push(performance.now() - t0);
    }
    const stat = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return `median ${s[Math.floor(s.length / 2)]!.toFixed(1)} ms, max ${s[s.length - 1]!.toFixed(1)} ms (n=${xs.length})`;
    };
    console.log(`\nShowcase, t = ${missionTimeLabel(at)} (${scenario.playback.readingTimes.length} reading times)`);
    console.log(`  session re-hydrate + Cabin & crew analysis: ${stat(runs)}`);
    console.log(`  session re-hydrate + crew overview: ${stat(crew)}`);
    const median = [...runs].sort((a, b) => a - b)[Math.floor(runs.length / 2)]!;
    for (const s of PLAYBACK_SPEEDS) {
      const perSecond = s.minPerSec;
      // Commits happen when the visible data changes (a 15-min cabin slot) at most every 250 ms, and never overlap.
      const wanted = perSecond / 15;
      const interval = Math.max(250, median);
      const rate = Math.min(wanted, 1000 / interval);
      console.log(`  ${s.label}: ${wanted.toFixed(2)} data changes/s -> about ${rate.toFixed(1)} recomputes/s (${(rate * median).toFixed(0)} ms of work per second)`);
    }
  }
}
