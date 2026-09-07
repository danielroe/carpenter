import * as v from 'valibot'

export const IssueLabel = {
  NeedsReproduction: 'needs reproduction',
  NeedsDetails: 'needs details',
  GoodReproduction: '✨ good reproduction',
  PossibleRegression: 'possible regression',
  PendingTriage: 'pending triage',
  Nitro: 'nitro',
  Documentation: 'documentation',
  Spam: 'spam',
  Duplicate: 'duplicate',
} as const
export type IssueLabel = typeof IssueLabel[keyof typeof IssueLabel]

export const IssueType = {
  Bug: 'bug',
  Enhancement: 'enhancement',
  Documentation: 'documentation',
  Spam: 'spam',
} as const
export type IssueType = typeof IssueType[keyof typeof IssueType]

export const AREAS = ['pages', 'components', 'layers', 'kit', 'types', 'schema', 'server components', 'suspense', 'cli', 'postcss', 'jsx', 'inline styles', 'a11y', 'performance'] as const
export type Area = typeof AREAS[number]

export const AREA_LABELS: Record<Area, string> = {
  'pages': 'pages',
  'components': 'components',
  'layers': 'layers',
  'kit': 'kit',
  'types': 'types',
  'schema': 'schema',
  'server components': 'server components',
  'suspense': 'suspense',
  'cli': 'cli',
  'postcss': 'postcss',
  'jsx': 'jsx',
  'inline styles': 'inline styles',
  'a11y': 'a11y',
  'performance': '⚡ performance',
}

export const BUNDLERS = ['webpack', 'rspack'] as const
export type Bundler = typeof BUNDLERS[number]

export const BUNDLER_LABELS: Record<Bundler, string> = {
  webpack: 'bundler:webpack',
  rspack: 'bundler:rspack',
}

export const PLATFORMS = ['windows', 'bun'] as const
export type Platform = typeof PLATFORMS[number]

export const PLATFORM_LABELS: Record<Platform, string> = {
  windows: 'platform:windows',
  bun: 'platform:bun',
}

export const newIssueAnalysisSchema = v.strictObject({
  issueType: v.pipe(
    v.picklist(['bug', 'enhancement', 'documentation', 'spam']),
    v.description('The type of issue. Use "enhancement" for feature requests.'),
  ),
  reproductionProvided: v.pipe(
    v.boolean(),
    v.description('Whether a reproduction is provided (GitHub repo link, StackBlitz, CodeSandbox, or a complete runnable code example).'),
  ),
  goodReproduction: v.pipe(
    v.boolean(),
    v.description('True only if a link to a minimal reproduction is provided (StackBlitz, CodeSandbox, or a small dedicated repo) together with clear steps and expected vs actual behaviour. False for inline code snippets, full applications, private repos, screenshots, or when no reproduction is provided.'),
  ),
  needsDetails: v.pipe(
    v.boolean(),
    v.description('True if a bug report is too vague to act on even with a reproduction: no expected vs actual behaviour, no error message or symptom, or a description that does not say what goes wrong. False for non-bugs.'),
  ),
  spokenLanguage: v.pipe(
    v.string(),
    v.description('The language of the issue in ISO 639-1 format (two-letter code only, no region codes).'),
  ),
  possibleRegression: v.pipe(
    v.boolean(),
    v.description('True if the issue appeared after upgrading or updating to a new version.'),
  ),
  nitro: v.pipe(
    v.boolean(),
    v.description('True if the bug is in the Nitro server engine: code in the server/ directory (api, routes, middleware, utils, plugins), nitro config and deployment presets, a specific hosting provider (Vercel, Netlify, Cloudflare, etc.), or prerendering. False for SSR rendering of pages/components, hydration, composables and client builds.'),
  ),
  nuxtVersion: v.pipe(
    v.nullable(v.string()),
    v.description('The Nuxt framework version the issue is reported against, copied verbatim from the environment info (e.g. "4.5.2", "5.0.0-29810797.4436de29", "main", "nightly"). Only the nuxt package itself, not @nuxt/cli, nitro, vue or node. Null if not stated.'),
  ),
  areas: v.pipe(
    v.array(v.picklist(AREAS)),
    v.maxLength(2),
    v.description('Up to two areas of the framework the issue is clearly about. Leave empty when unsure; an empty list is better than a wrong guess.'),
  ),
  bundler: v.pipe(
    v.picklist(['none', ...BUNDLERS]),
    v.description('"none" unless the bug is specific to a non-default bundler (a build/transform/HMR error from it, or the report says it works with Vite but not this one). Vite is the default and always "none". The bundler appearing in the environment info is not sufficient.'),
  ),
  platform: v.pipe(
    v.picklist(['none', ...PLATFORMS]),
    v.description('"none" unless the bug is specific to a platform: "windows" for path separators, named pipes, case sensitivity or symlink issues that would not happen on macOS/Linux; "bun" for Bun runtime or package manager incompatibilities. The reporter using Windows or Bun is not sufficient.'),
  ),
})

export const commentAnalysisSchema = v.strictObject({
  reproductionProvided: v.pipe(
    v.boolean(),
    v.description('Whether this content provides a reproduction (GitHub repo link, StackBlitz, CodeSandbox, or a complete runnable code example).'),
  ),
  possibleRegression: v.pipe(
    v.boolean(),
    v.description('True if this content indicates the bug reappeared after an upgrade.'),
  ),
})

export const enhancedAnalysisSchema = v.strictObject({
  reproductionProvided: v.pipe(
    v.boolean(),
    v.description('Whether a reproduction is provided in the issue or recent comments.'),
  ),
  possibleRegression: v.pipe(
    v.boolean(),
    v.description('True if evidence suggests a bug reappeared after an upgrade.'),
  ),
  shouldReopen: v.pipe(
    v.boolean(),
    v.description('Whether the closed issue should be reopened based on new evidence.'),
  ),
  isDifferentFromDuplicate: v.pipe(
    v.boolean(),
    v.description('For issues marked as duplicate, whether evidence suggests this is actually a different issue.'),
  ),
  confidence: v.pipe(
    v.picklist(['low', 'medium', 'high']),
    v.description('Confidence level in the analysis based on available context.'),
  ),
})

export const translationSchema = v.strictObject({
  translatedTitle: v.pipe(
    v.string(),
    v.description('The translated title in English.'),
  ),
  translatedBody: v.pipe(
    v.nullable(v.string()),
    v.description('The translated body in English with markdown formatting, code blocks, and links kept intact. Null if no body was provided.'),
  ),
})

export type NewIssueAnalysis = v.InferOutput<typeof newIssueAnalysisSchema>
