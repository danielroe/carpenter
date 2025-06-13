import { z } from 'zod'

export const responseSchema = {
  title: 'Issue Categorisation',
  type: 'object',
  properties: {
    issueType: { type: 'string', enum: ['bug', 'feature', 'documentation', 'chore', 'help-wanted', 'spam'] },
    reproductionProvided: { type: 'boolean' },
    spokenLanguage: { type: 'string', comment: 'The language of the title in ISO 639-1 format. Do not include country codes, only language code.' },
    possibleRegression: {
      type: 'boolean',
      comment: 'If the issue is reported on upgrade to a new version of Nuxt, it is a possible regression.',
    },
    nitro: {
      type: 'boolean',
      comment: 'If the issue is reported only in relation to a single deployment provider, it is possibly a Nitro issue.',
    },
  },
} as const

export const commentAnalysisSchema = {
  title: 'Issue Categorisation',
  type: 'object',
  properties: {
    reproductionProvided: { type: 'boolean' },
    possibleRegression: { type: 'boolean', comment: 'If the issue reported is a bug and the bug has reappeared on upgrade to a new version of Nuxt, it is a possible regression.' },
  },
}

export const enhancedAnalysisSchema = {
  title: 'Enhanced Issue Analysis',
  type: 'object',
  properties: {
    reproductionProvided: { type: 'boolean' },
    possibleRegression: { type: 'boolean', comment: 'If the issue reported is a bug and the bug has reappeared on upgrade to a new version of Nuxt, it is a possible regression.' },
    shouldReopen: { type: 'boolean', comment: 'Whether a closed issue should be reopened based on new evidence or context.' },
    isDifferentFromDuplicate: { type: 'boolean', comment: 'For issues marked as duplicate, whether the evidence suggests this is actually a different issue.' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'], comment: 'Confidence level in the analysis based on available context.' },
  },
}

export const commentAnalysisResponseSchema = z.object({
  reproductionProvided: z.boolean().optional(),
  possibleRegression: z.boolean().optional(),
})

export const enhancedAnalysisResponseSchema = z.object({
  reproductionProvided: z.boolean().optional(),
  possibleRegression: z.boolean().optional(),
  shouldReopen: z.boolean().optional(),
  isDifferentFromDuplicate: z.boolean().optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
})

export enum IssueLabel {
  NeedsReproduction = 'needs reproduction',
  PossibleRegression = 'possible regression',
  PendingTriage = 'pending triage',
  Nitro = 'nitro',
  Documentation = 'documentation',
}

export enum IssueType {
  Bug = 'bug',
  Feature = 'feature',
  Documentation = 'documentation',
  Spam = 'spam',
}

// Define schemas
export const aiResponseSchema = z.object({
  response: z.string().optional(),
  tool_calls: z.array(z.object({
    name: z.string(),
    arguments: z.unknown(),
  })).optional(),
})

export const translationResponseSchema = z.object({
  translated_text: z.string().optional(),
})

// TODO: generate AI model schema from this?
export const analyzedIssueSchema = z.object({
  issueType: z.nativeEnum(IssueType),
  reproductionProvided: z.boolean().nullable().transform(v => v ?? false),
  spokenLanguage: z.string().nullable().transform(lang => getNormalizedLanguage(lang)).describe('The language of the title in ISO 639-1 format.'),
  possibleRegression: z.boolean().nullable().transform(v => v ?? false).describe('If the issue is reported on upgrade to a new version of Nuxt, it is a possible regression.'),
  nitro: z.boolean().nullable().transform(v => v ?? false).describe('If the issue is reported only in relation to a single deployment provider, it is possibly a Nitro issue.'),
})
  .describe('Issue Categorisation')
