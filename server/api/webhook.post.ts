import { z } from 'zod'
import { isError } from 'h3'
import type { H3Event } from 'h3'

import type { IssuesEvent, IssueCommentEvent } from '@octokit/webhooks-types'

export default defineEventHandler(async (event) => {
  const isValidWebhook = await isValidGitHubWebhook(event)

  if (!import.meta.dev && !isValidWebhook) {
    throw createError({ statusCode: 401, message: 'Unauthorized: webhook is not valid' })
  }

  const webhookPayload = await readValidatedBody(event, githubWebhookSchema.parse) as IssuesEvent | IssueCommentEvent
  const { action } = webhookPayload

  if ('comment' in webhookPayload && 'issue' in webhookPayload) {
    return handleIssueComment(event, webhookPayload)
  }

  if ('issue' in webhookPayload && action === 'edited' && webhookPayload.issue) {
    return handleIssueEdit(event, webhookPayload)
  }

  if ('issue' in webhookPayload && action === 'opened') {
    return handleNewIssue(event, webhookPayload)
  }

  return null
})

type CommentAnalysisResult = {
  containsReproduction: boolean
  reportsIssueReappeared: boolean
}

async function handleIssueComment(event: H3Event, { comment, issue, repository }: IssueCommentEvent) {
  const issueLabels = issue.labels?.map(label => label.name) || []
  const hasNeedsReproductionLabel = issueLabels.includes(IssueLabel.NeedsReproduction)

  if (!hasNeedsReproductionLabel && issue.state !== 'closed') {
    return
  }

  const $github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  try {
    const res = await hubAI().run('@hf/nousresearch/hermes-2-pro-mistral-7b', {
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that analyzes GitHub issue comments. Answer in JSON format only. Here's the json schema you must adhere to:\n<schema>\n${JSON.stringify(commentAnalysisSchema)}\n</schema>\n`,
        },
        {
          role: 'user',
          content: `The issue is ${issue.state === 'closed' ? 'closed' : 'open'}.
          Issue has the following labels: ${issueLabels.join(', ')}.
          
          Comment content:
          ${comment.body}`,
        },
      ],
    })

    const aiResponse = aiResponseSchema.parse(res)
    if (!aiResponse.response) {
      console.error('Missing AI response', res)
      return null
    }

    let analysisResult: CommentAnalysisResult
    try {
      analysisResult = commentAnalysisSchema.parse(JSON.parse(aiResponse.response.trim()))
    }
    catch (e) {
      console.error('Invalid AI response', aiResponse.response, e)
      return null
    }

    // 1. if a comment adds a reproduction
    if (hasNeedsReproductionLabel && analysisResult.containsReproduction) {
      // we can go ahead and remove the 'needs reproduction' label
      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}/labels/${encodeURIComponent(IssueLabel.NeedsReproduction)}`, {
        method: 'DELETE',
      }))
      // ... plus, if issue is closed, we'll reopen it
      if (issue.state === 'closed') {
        promises.push($github(`repos/${repository.full_name}/issues/${issue.number}`, {
          method: 'PATCH',
          body: {
            state: 'open',
          },
        }))
      }
    }
    // 2. if a resolved issue reappears
    else if (issue.state === 'closed' && analysisResult.reportsIssueReappeared) {
      // then reopen the issue
      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}`, {
        method: 'PATCH',
        body: {
          state: 'open',
        },
      }))

      // ... and add 'pending triage' and 'possible regression' labels
      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}/labels`, {
        method: 'POST',
        body: {
          labels: [IssueLabel.PendingTriage, IssueLabel.PossibleRegression],
        },
      }))
    }

    event.waitUntil(Promise.all(promises))
    return Promise.allSettled(promises)
  }
  catch (e) {
    console.error('Error processing issue comment', e)
    return null
  }
}

async function handleIssueEdit(event: H3Event, { issue, repository }: IssuesEvent) {
  const issueLabels = issue.labels?.map(label => label.name) || []
  const hasNeedsReproductionLabel = issueLabels.includes(IssueLabel.NeedsReproduction)

  if (!hasNeedsReproductionLabel) {
    return null
  }

  const $github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  try {
    const res = await hubAI().run('@hf/nousresearch/hermes-2-pro-mistral-7b', {
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that analyzes GitHub issues. Answer in JSON format only. Here's the json schema you must adhere to:\n<schema>\n${JSON.stringify(commentAnalysisSchema)}\n</schema>\n`,
        },
        {
          role: 'user',
          content: `Does the following issue body contain a clear reproduction of the problem?
          
          ${getNormalizedIssueContent(issue.body || '')}`,
        },
      ],
    })

    const aiResponse = aiResponseSchema.parse(res)
    if (!aiResponse.response) {
      console.error('Missing AI response', res)
      return null
    }

    let analysisResult: CommentAnalysisResult
    try {
      analysisResult = commentAnalysisSchema.parse(JSON.parse(aiResponse.response.trim()))
    }
    catch (e) {
      console.error('Invalid AI response', aiResponse.response, e)
      return null
    }

    if (analysisResult.containsReproduction) {
      // we can go ahead and remove the 'needs reproduction' label
      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}/labels/${encodeURIComponent(IssueLabel.NeedsReproduction)}`, {
        method: 'DELETE',
      }))

      event.waitUntil(Promise.all(promises))
      return Promise.allSettled(promises)
    }
  }
  catch (e) {
    console.error('Error processing issue edit', e)
    return null
  }

  return null
}

async function handleNewIssue(event: H3Event, { action, issue, repository }: IssuesEvent) {
  if (action !== 'opened') return null

  const ai = hubAI()
  const runtimeConfig = useRuntimeConfig(event)

  let analyzedIssue: z.infer<typeof analyzedIssueSchema> | null = null

  // Run the AI model and parse the response
  try {
    const res = await ai.run('@hf/nousresearch/hermes-2-pro-mistral-7b', {
      messages: [
        {
          role: 'system',
          content: `You are a kind, helpful open-source maintainer that answers in JSON. If the issue looks like spam (contains gibberish, nonsense, etc.), it is marked as spam. Do not mark issues as spam purely based on non-English content or bad grammar. Do not answer with anything else other than a valid JSON. Here\`s the json schema you must adhere to:\n<schema>\n${JSON.stringify(responseSchema)}\n</schema>\n`,
        },
        { role: 'user', content: `# ${issue.title}\n\n${getNormalizedIssueContent(issue.body || '')}` },
      ],
    })

    const aiResponse = aiResponseSchema.parse(res)
    if (!aiResponse.response) {
      console.error('Missing AI response', res)
      throw createError({
        statusCode: 500,
        message: 'Missing AI response',
      })
    }

    try {
      analyzedIssue = analyzedIssueSchema.parse(JSON.parse(aiResponse.response.trim()))
    }
    catch (e) {
      console.error('Invalid AI response', aiResponse.response, e)
      throw createError({
        statusCode: 500,
        message: 'Invalid AI response',
      })
    }
  }
  catch (e) {
    if (isError(e)) {
      throw e
    }

    console.error('Unknown AI error', e)
    throw createError({
      statusCode: 500,
      message: 'Unknown AI error',
    })
  }

  const $github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  // Update the GitHub issue
  try {
    const labels: IssueLabel[] = []

    if (analyzedIssue.issueType === IssueType.Spam) {
      promises.push($github('graphql', {
        baseURL: 'https://api.github.com/',
        method: 'POST',
        body: {
          query: `
            mutation {
              transferIssue(input: { issueId: "${issue.node_id}", repositoryId: "${runtimeConfig.github.targetRepositoryNodeId}" }) {
                issue {
                  number
                }
              }
            }
          `,
        },
      }))
    }
    else {
      if (analyzedIssue.issueType === IssueType.Bug && !analyzedIssue.reproductionProvided) {
        labels.push(IssueLabel.NeedsReproduction)
      }
      if (analyzedIssue.issueType === IssueType.Bug && analyzedIssue.possibleRegression) {
        labels.push(IssueLabel.PossibleRegression)
      }
      if (analyzedIssue.nitro) {
        labels.push(IssueLabel.Nitro)
      }
      if (analyzedIssue.issueType === IssueType.Documentation) {
        labels.push(IssueLabel.Documentation)
      }
    }

    if (labels.length > 0) {
      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}/labels`, {
        method: 'POST',
        body: { labels },
      }))
    }

    // Translate non-English issue titles to English
    if (analyzedIssue.spokenLanguage !== 'en' && analyzedIssue.issueType !== IssueType.Spam) {
      try {
        const res = await ai.run('@cf/meta/m2m100-1.2b', {
          text: issue.title,
          source_lang: analyzedIssue.spokenLanguage,
          target_lang: 'english',
        })

        const { translated_text } = translationResponseSchema.parse(res)

        if (!translated_text || !translated_text.trim().length) return
        promises.push($github(`repos/${repository.full_name}/issues/${issue.number}`, {
          method: 'PATCH',
          body: {
            title: `[${analyzedIssue?.spokenLanguage}:translated] ${translated_text}`,
          },
        }))
      }
      catch (e) {
        console.error('Error translating issue title', e)
      }
    }

    event.waitUntil(Promise.all(promises))
    setHeaders(event, {
      'x-assigned-labels': JSON.stringify(labels),
      'x-analysis': JSON.stringify(analyzedIssue),
    })

    return Promise.allSettled(promises)
  }
  catch (e) {
    console.error('Error updating issue', e)
    throw createError({
      statusCode: 500,
      message: 'Error updating issue',
    })
  }
}

const responseSchema = {
  title: 'Issue Categorisation',
  type: 'object',
  properties: {
    issueType: { type: 'string', enum: ['bug', 'feature', 'documentation', 'spam'] },
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Response = {
  [key in keyof typeof responseSchema['properties']]: typeof responseSchema['properties'][key]['type'] extends 'string' ? 'enum' extends keyof typeof responseSchema['properties'][key] ? typeof responseSchema['properties'][key]['enum'] extends Array<infer S> ? S : string : string : typeof responseSchema['properties'][key]['type'] extends 'boolean' ? boolean : unknown
}

const commentAnalysisSchema = z.object({
  containsReproduction: z.boolean().describe('Whether the comment contains a clear reproduction of the issue.'),
  reportsIssueReappeared: z.boolean().describe('Whether the comment reports that a resolved issue has reappeared or regressed.'),
})

enum IssueLabel {
  NeedsReproduction = 'needs reproduction',
  PossibleRegression = 'possible regression',
  PendingTriage = 'pending triage',
  Nitro = 'nitro',
  Documentation = 'documentation',
}

enum IssueType {
  Bug = 'bug',
  Feature = 'feature',
  Documentation = 'documentation',
  Spam = 'spam',
}

// Define schemas
const webhookIssueSchema = z.object({
  action: z.string(),
  issue: z.object({
    title: z.string(),
    body: z.string().nullable(),
    number: z.number(),
    node_id: z.string(),
    state: z.enum(['open', 'closed']),
    labels: z.array(z.object({
      name: z.string(),
    })).optional(),
  }),
  repository: z.object({
    full_name: z.string(),
  }),
  installation: z.unknown().optional(),
})

const webhookIssueCommentSchema = z.object({
  action: z.string(),
  comment: z.object({
    body: z.string(),
  }),
  issue: z.object({
    number: z.number(),
    state: z.enum(['open', 'closed']),
    labels: z.array(z.object({
      name: z.string(),
    })).optional(),
  }),
  repository: z.object({
    full_name: z.string(),
  }),
  installation: z.unknown().optional(),
})

const githubWebhookSchema = z.union([
  webhookIssueSchema,
  webhookIssueCommentSchema,
])

const aiResponseSchema = z.object({
  response: z.string().optional(),
  tool_calls: z.array(z.object({
    name: z.string(),
    arguments: z.unknown(),
  })).optional(),
})

const translationResponseSchema = z.object({
  translated_text: z.string().optional(),
})

// TODO: generate AI model schema from this?
const analyzedIssueSchema = z.object({
  issueType: z.nativeEnum(IssueType),
  reproductionProvided: z.boolean().nullable().transform(v => v ?? false),
  spokenLanguage: z.string().nullable().transform(lang => getNormalizedLanguage(lang)).describe('The language of the title in ISO 639-1 format.'),
  possibleRegression: z.boolean().nullable().transform(v => v ?? false).describe('If the issue is reported on upgrade to a new version of Nuxt, it is a possible regression.'),
  nitro: z.boolean().nullable().transform(v => v ?? false).describe('If the issue is reported only in relation to a single deployment provider, it is possibly a Nitro issue.'),
})
  .describe('Issue Categorisation')
