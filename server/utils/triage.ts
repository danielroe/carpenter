import { PROMPT_INJECTION_GUARD } from './ai.ts'
import { getNormalizedIssueContent } from './normalization.ts'
import { getEnvironmentSection, getVersionLabel } from './version.ts'
import { IssueLabel, IssueType, AREAS, AREA_LABELS, BUNDLER_LABELS, PLATFORM_LABELS } from './schema.ts'
import type { NewIssueAnalysis, Platform } from './schema.ts'

export function buildNewIssueSystemPrompt(projectName: string) {
  return `You categorise issues in an open source project (${projectName}).

Guidelines:
- Reported bugs MUST have reproduction information (GitHub repo link, StackBlitz, CodeSandbox, or a complete code example)
- Mark as spam ONLY if content is gibberish or nonsense. Do NOT mark as spam based on non-English content, poor grammar, or short/terse descriptions
- "enhancement" is for feature requests, "documentation" is for docs improvements, "bug" is for bug reports
- goodReproduction is true only when a LINK to a minimal reproduction (StackBlitz, CodeSandbox, small dedicated repo) is given with clear steps and expected vs actual behaviour. Inline snippets never count
- needsDetails is true for bug reports that do not say what actually goes wrong (no error, no expected vs actual behaviour), regardless of whether a reproduction is linked
- possibleRegression is true if the user mentions upgrading/updating and the issue appeared afterwards
- nitro is true only if the bug is in the Nitro server engine: code in the server/ directory (api, routes, middleware, utils, plugins), nitro config and deployment presets, a specific hosting provider (Vercel, Netlify, Cloudflare, etc.), or prerendering. SSR rendering of pages and components, hydration, composables such as useAsyncData/useFetch, and client build output are NOT nitro
- nuxtVersion is the version of the nuxt package from the environment info ("Nuxt version", "nuxt:", "nuxt-nightly"), copied verbatim. Do NOT use the nuxt/cli, nitro, vue or node versions. If only a branch or channel is named (e.g. "main", "nightly"), return that word. Null if not stated
- areas: pick at most two of ${AREAS.join(', ')}, and ONLY when the bug is in that subsystem itself. Most bugs belong to no area; return an empty list by default. Definitions:
  - "pages" = the pages/ directory scanning, generated routes, route params, or <NuxtPage>. Not every bug that happens on a page
  - "components" = the components/ directory scanning, auto-import or resolution of components (missing/wrong component, lazy prefix, global). Not every bug that involves a component
  - "server components" = .server.vue islands / <NuxtIsland>
  - "layers" = extends/layers merging; "kit" = @nuxt/kit utilities used by module authors; "schema" = nuxt.config validation and its types; "types" = any TypeScript problem: type errors, wrong or missing types, typecheck failures, typed routes; "cli" = the nuxt/nuxi command line itself; "performance" = slowness, memory or bundle size
- bundler: "none" unless the bug is specific to webpack or rspack (a build/transform/HMR error from it, or "works with Vite but not X"). Vite is the default and is always "none". Never pick a bundler the report does not mention
- platform: "none" unless the bug would NOT happen on other platforms (Windows path separators or named pipes, Bun-specific runtime behaviour). The environment info listing Windows or Bun is not sufficient

${PROMPT_INJECTION_GUARD}`
}

export function buildNewIssueInput(issue: { title: string, body?: string | null }) {
  const body = issue.body || ''
  return {
    title: issue.title,
    environment: getEnvironmentSection(body),
    body: getNormalizedIssueContent(body),
  }
}

export interface DeriveLabelsOptions {
  /** Labels already on the issue (e.g. added by the issue template). */
  existingLabels: string[]
  /** The raw issue body, used to verify reproduction links and platform mentions. */
  body?: string | null
  mainBranchMajor: string
}

const INSTANT_REPRODUCTION_LINK = /https?:\/\/(?:www\.)?(?:stackblitz\.com|codesandbox\.io)\/(?!(?:s\/)?github\/nuxt\/starter)\S+/i

/**
 * Whether the report links to a reproduction that can be opened without
 * cloning anything. Links to the bare starter templates from the issue
 * template do not count.
 */
export function hasInstantReproductionLink(body: string | null | undefined) {
  return INSTANT_REPRODUCTION_LINK.test(body || '')
}

const PLATFORM_MENTIONS: Record<Platform, RegExp> = {
  windows: /\b(?:windows|win32|powershell|wsl)\b/i,
  bun: /\bbunx?\b/i,
}

/**
 * The model tends to pick a platform whenever the environment section lists
 * it, so the label is only applied when the report itself talks about that
 * platform outside the environment section.
 */
export function isPlatformDiscussed(platform: Platform, body: string | null | undefined) {
  const text = body || ''
  const environment = getEnvironmentSection(text)
  const rest = environment ? text.replace(environment, '') : text
  return PLATFORM_MENTIONS[platform].test(rest)
}

/**
 * Turn a model analysis into the set of labels to add. Deterministic so it can
 * be unit tested and run offline against historical issues.
 */
export function deriveNewIssueLabels(analysis: NewIssueAnalysis, options: DeriveLabelsOptions): string[] {
  if (analysis.issueType === IssueType.Spam) {
    return [IssueLabel.Spam]
  }

  const labels: string[] = []
  const isBug = analysis.issueType === IssueType.Bug

  if (isBug && !analysis.reproductionProvided) {
    labels.push(IssueLabel.NeedsReproduction)
  }
  else if (isBug && analysis.goodReproduction && hasInstantReproductionLink(options.body)) {
    labels.push(IssueLabel.GoodReproduction)
  }
  if (isBug && analysis.needsDetails) {
    labels.push(IssueLabel.NeedsDetails)
  }
  if (analysis.possibleRegression) {
    labels.push(IssueLabel.PossibleRegression)
  }
  if (analysis.nitro) {
    labels.push(IssueLabel.Nitro)
  }

  const hasTriageLabel = labels.some(label => label !== IssueLabel.GoodReproduction)
  if (!hasTriageLabel && options.existingLabels.length === 0) {
    labels.push(IssueLabel.PendingTriage)
  }

  for (const area of analysis.areas) {
    labels.push(AREA_LABELS[area])
  }
  if (analysis.bundler !== 'none') {
    labels.push(BUNDLER_LABELS[analysis.bundler])
  }

  if (analysis.platform !== 'none' && isPlatformDiscussed(analysis.platform, options.body)) {
    labels.push(PLATFORM_LABELS[analysis.platform])
  }

  if (isBug) {
    const versionLabel = getVersionLabel(analysis.nuxtVersion, options.mainBranchMajor)
    if (versionLabel) {
      labels.push(versionLabel)
    }
  }

  return [...new Set(labels)]
}
