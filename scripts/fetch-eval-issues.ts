/// <reference types="node" />
import { mkdir, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { Octokit } from '@octokit/rest'

export interface EvalIssue {
  number: number
  title: string
  body: string
  state: string
  stateReason: string | null
  createdAt: string
  type: string | null
  labels: string[]
}

const [owner, repo] = (process.env.EVAL_REPO || 'nuxt/nuxt').split('/')
const limit = Number(process.env.EVAL_LIMIT || 200)
const outFile = process.env.EVAL_FILE || 'eval/issues.json'

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  if (process.env.NUXT_GITHUB_TOKEN) return process.env.NUXT_GITHUB_TOKEN
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim()
  }
  catch {
    return undefined
  }
}

const github = new Octokit({ auth: getToken() })

const issues: EvalIssue[] = []

// Issues need to be old enough that a human has actually triaged them, so skip
// the most recent two weeks.
const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

for await (const response of github.paginate.iterator(github.issues.listForRepo, {
  owner: owner!,
  repo: repo!,
  state: 'all',
  sort: 'created',
  direction: 'desc',
  per_page: 100,
})) {
  for (const issue of response.data) {
    if (issue.pull_request || !issue.body || issue.user?.type === 'Bot') continue
    if (issue.created_at > cutoff) continue
    const labels = issue.labels.map(label => typeof label === 'string' ? label : label.name!).filter(Boolean)
    if (labels.length === 0 || labels.includes('spam')) continue

    issues.push({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      stateReason: issue.state_reason ?? null,
      createdAt: issue.created_at,
      type: (issue as { type?: { name: string } | null }).type?.name ?? null,
      labels,
    })
    if (issues.length >= limit) break
  }
  if (issues.length >= limit) break
}

await mkdir('eval', { recursive: true })
await writeFile(outFile, JSON.stringify(issues, null, 2))
console.log(`Wrote ${issues.length} issues from ${owner}/${repo} to ${outFile}`)
