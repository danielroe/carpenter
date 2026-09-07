/// <reference types="node" />
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { newIssueAnalysisSchema, IssueLabel, IssueType } from '../server/utils/schema.ts'
import type { NewIssueAnalysis } from '../server/utils/schema.ts'
import { buildNewIssueSystemPrompt, buildNewIssueInput, deriveNewIssueLabels } from '../server/utils/triage.ts'
import { runStructuredAnalysis } from '../server/utils/ai.ts'
import type { EvalIssue } from './fetch-eval-issues.ts'

const model = process.env.EVAL_MODEL || process.env.NUXT_AI_SIMPLE_MODEL || 'openai/gpt-4o-mini'
const projectName = process.env.NUXT_TRIAGE_PROJECT_NAME || 'Nuxt framework'
const mainBranchMajor = process.env.NUXT_TRIAGE_MAIN_BRANCH_MAJOR || '5'
const issuesFile = process.env.EVAL_FILE || 'eval/issues.json'
const limit = Number(process.env.EVAL_LIMIT || Infinity)
const concurrency = Number(process.env.EVAL_CONCURRENCY || 4)
const fresh = process.argv.includes('--fresh')
const verbose = process.argv.includes('--verbose')

const cacheFile = `eval/analysis-${model.replace(/[^\w.-]/g, '_')}.json`

// Labels that Carpenter is expected to get right on its own. Others in the
// repo (priorities, areas outside the picklist, etc.) are ignored.
const EVALUATED_LABELS = [
  IssueLabel.NeedsReproduction,
  IssueLabel.NeedsDetails,
  IssueLabel.GoodReproduction,
  IssueLabel.PossibleRegression,
  IssueLabel.Nitro,
  '3.x', '4.x', '5.x',
  'pages', 'components', 'layers', 'kit', 'types', 'schema', 'server components', 'suspense', 'cli', 'postcss', 'jsx', 'inline styles', 'a11y', '⚡ performance',
  'bundler:webpack', 'bundler:rspack',
  'platform:windows', 'platform:bun',
]

// Labels a human removes once resolved, so their absence on a closed issue is
// not evidence the model was wrong. Only their presence counts as ground truth.
const TRANSIENT_LABELS = new Set<string>([IssueLabel.NeedsReproduction, IssueLabel.NeedsDetails])

const TYPE_FROM_LABEL: Record<string, IssueType> = {
  '🐛 bug': IssueType.Bug,
  '✨ enhancement': IssueType.Enhancement,
  '📚 documentation': IssueType.Documentation,
}

function expectedType(issue: EvalIssue): IssueType | null {
  const fromType = issue.type?.toLowerCase()
  if (fromType && Object.values(IssueType).includes(fromType as IssueType)) {
    return fromType as IssueType
  }
  for (const label of issue.labels) {
    if (TYPE_FROM_LABEL[label]) return TYPE_FROM_LABEL[label]
  }
  return null
}

async function loadCache(): Promise<Record<number, NewIssueAnalysis>> {
  if (fresh || !existsSync(cacheFile)) return {}
  return JSON.parse(await readFile(cacheFile, 'utf8'))
}

async function mapWithConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }))
  return results
}

const issues = (JSON.parse(await readFile(issuesFile, 'utf8')) as EvalIssue[]).slice(0, limit)
const cache = await loadCache()
const system = buildNewIssueSystemPrompt(projectName)

let completed = 0
const analyses = await mapWithConcurrency(issues, async (issue) => {
  if (!cache[issue.number]) {
    try {
      cache[issue.number] = await runStructuredAnalysis(model, {
        schema: newIssueAnalysisSchema,
        system,
        input: buildNewIssueInput(issue),
      })
    }
    catch (error) {
      console.error(`#${issue.number}: ${(error as Error).message}`)
      return null
    }
  }
  completed++
  if (completed % 20 === 0) process.stderr.write(`${completed}/${issues.length}\n`)
  return cache[issue.number]!
})

await mkdir('eval', { recursive: true })
await writeFile(cacheFile, JSON.stringify(cache, null, 2))

interface Counts { tp: number, fp: number, fn: number }
const counts = new Map<string, Counts>(EVALUATED_LABELS.map(label => [label, { tp: 0, fp: 0, fn: 0 }]))
let typeCorrect = 0
let typeTotal = 0
const typeConfusion = new Map<string, number>()
const mismatches: string[] = []

for (const [index, issue] of issues.entries()) {
  const analysis = analyses[index]
  if (!analysis) continue

  const expected = expectedType(issue)
  if (expected) {
    typeTotal++
    if (analysis.issueType === expected) typeCorrect++
    else typeConfusion.set(`${expected} -> ${analysis.issueType}`, (typeConfusion.get(`${expected} -> ${analysis.issueType}`) ?? 0) + 1)
  }

  const predicted = new Set(deriveNewIssueLabels(analysis, {
    existingLabels: issue.body.includes('### Environment') ? [IssueLabel.PendingTriage] : [],
    body: issue.body,
    mainBranchMajor,
  }))
  const actual = new Set(issue.labels)

  for (const label of EVALUATED_LABELS) {
    const count = counts.get(label)!
    const has = actual.has(label)
    const got = predicted.has(label)
    if (has && got) count.tp++
    else if (got && !has) {
      if (TRANSIENT_LABELS.has(label) && issue.state === 'closed') continue
      count.fp++
      mismatches.push(`#${issue.number} false positive: ${label}`)
    }
    else if (has && !got) {
      count.fn++
      mismatches.push(`#${issue.number} missed: ${label}`)
    }
  }
}

const pct = (n: number) => `${(n * 100).toFixed(0).padStart(3)}%`
const rows = [...counts.entries()]
  .filter(([, c]) => c.tp + c.fp + c.fn > 0)
  .map(([label, c]) => {
    const precision = c.tp / (c.tp + c.fp || 1)
    const recall = c.tp / (c.tp + c.fn || 1)
    const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0
    return { label, ...c, precision, recall, f1 }
  })

console.log(`\nModel: ${model}  Issues: ${analyses.filter(Boolean).length}/${issues.length}\n`)
console.log(`Issue type accuracy: ${pct(typeCorrect / (typeTotal || 1))} (${typeCorrect}/${typeTotal})`)
for (const [pair, n] of [...typeConfusion.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pair}: ${n}`)
}

console.log(`\n${'label'.padEnd(24)} ${'tp'.padStart(4)} ${'fp'.padStart(4)} ${'fn'.padStart(4)}  prec  rec   f1`)
for (const row of rows) {
  console.log(`${row.label.padEnd(24)} ${String(row.tp).padStart(4)} ${String(row.fp).padStart(4)} ${String(row.fn).padStart(4)}  ${pct(row.precision)} ${pct(row.recall)} ${pct(row.f1)}`)
}

if (verbose) {
  console.log(`\n${mismatches.join('\n')}`)
}
