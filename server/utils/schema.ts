import * as v from 'valibot'

export enum IssueLabel {
  NeedsReproduction = 'needs reproduction',
  PossibleRegression = 'possible regression',
  PendingTriage = 'pending triage',
  Nitro = 'nitro',
  Documentation = 'documentation',
  Spam = 'spam',
  Duplicate = 'duplicate',
}

export enum IssueType {
  Bug = 'bug',
  Enhancement = 'enhancement',
  Documentation = 'documentation',
  Spam = 'spam',
}

export const newIssueAnalysisSchema = v.object({
  issueType: v.pipe(
    v.picklist(['bug', 'enhancement', 'documentation', 'spam']),
    v.description('The type of issue. Use "enhancement" for feature requests.'),
  ),
  reproductionProvided: v.pipe(
    v.boolean(),
    v.description('Whether a reproduction is provided (GitHub repo link, StackBlitz, CodeSandbox, or a complete runnable code example).'),
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
    v.description('True if the issue is specific to a single deployment provider (Vercel, Netlify, Cloudflare, etc.).'),
  ),
})

export const commentAnalysisSchema = v.object({
  reproductionProvided: v.pipe(
    v.boolean(),
    v.description('Whether this content provides a reproduction (GitHub repo link, StackBlitz, CodeSandbox, or a complete runnable code example).'),
  ),
  possibleRegression: v.pipe(
    v.boolean(),
    v.description('True if this content indicates the bug reappeared after an upgrade.'),
  ),
})

export const enhancedAnalysisSchema = v.object({
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

export const translationSchema = v.object({
  translatedTitle: v.pipe(
    v.string(),
    v.description('The translated title in English.'),
  ),
  translatedBody: v.pipe(
    v.nullable(v.string()),
    v.description('The translated body in English with markdown formatting, code blocks, and links kept intact. Null if no body was provided.'),
  ),
})
