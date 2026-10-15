// @vault-duel/sim public entry point (ARCHITECTURE.md §2). The simulator is a CLI (cli.ts); this exports its parts for tests.
export { addDays, dateRange, parseArgs, UsageError } from './args';
export type { CliOptions, Command } from './args';
export { mergeAll, mergeInto, median, percentile, stableJson } from './aggregate';
export type { Aggregate } from './aggregate';
export { checkDates, summarise } from './difficulty-batch';
export { BOT_IDS } from './jobs';
export type { BotId, SimJob } from './jobs';
export { balanceJobs } from './plan';
export { defaultWorkers, Pool } from './pool';
export { buildReport, deterministicPart, evaluatePerf, evaluateTargets, renderMarkdown, writeReport } from './report';
export type { Metric, Report } from './report';
export { loadContext } from './world';
export { buildManifest, inspectManifest, parseManifestText, serializeManifest } from './seeds';
export type { Manifest, ManifestInspection, ManifestRating } from './seeds';
