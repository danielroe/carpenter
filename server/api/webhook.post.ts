import { z } from 'zod'
import { isError } from 'h3'
import type { H3Event } from 'h3'

import type { IssuesEvent, IssueCommentEvent } from '@octokit/webhooks-types'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev && !(await isValidGitHubWebhook(event))) {
    throw createError({ statusCode: 401, message: 'Unauthorized: webhook is not valid' })
  }

  const webhookPayload = await readBody(event) as IssuesEvent | IssueCommentEvent
  const { action } = webhookPayload

  if (!('issue' in webhookPayload) || 'pull_request' in webhookPayload.issue) {
    return
  }

  if ('comment' in webhookPayload) {
    return handleIssueComment(event, webhookPayload)
  }

  if (action === 'edited') {
    return handleIssueEdit(event, webhookPayload)
  }

  if (action === 'opened') {
    return handleNewIssue(event, webhookPayload)
  }

  return null
})

type CommentAnalysisResult = {
  reproductionProvided?: boolean
  possibleRegression?: boolean
}

async function handleIssueComment(event: H3Event, { comment, issue, repository }: IssueCommentEvent) {
  if (comment.user?.type === 'Bot') {
    return
  }

  if ('pull_request' in issue) {
    return
  }

  const issueLabels = issue.labels?.map(label => label.name) || []
  const hasNeedsReproductionLabel = issueLabels.includes(IssueLabel.NeedsReproduction)

  if (!hasNeedsReproductionLabel && issue.state !== 'closed') {
    return
  }

  const github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  try {
    const res = await hubAI().run('@hf/nousresearch/hermes-2-pro-mistral-7b', {
      messages: [
        {
          role: 'system',
          content: `You are a kind, helpful open-source maintainer that answers in JSON. Do not answer with anything else other than a valid JSON. Here's the json schema you must adhere to:\n<schema>\n${JSON.stringify(commentAnalysisSchema)}\n</schema>\n`,
        },
        { role: 'user', content: JSON.stringify({ body: getNormalizedIssueContent(comment.body) }) },
      ],
    })

    setHeader(event, 'x-comment-analysis', JSON.stringify(res))

    const analysisResult: CommentAnalysisResult = 'response' in res ? commentAnalysisResponseSchema.parse(JSON.parse(res.response || '{}')) : {}

    // 1. if a comment adds a reproduction
    if (hasNeedsReproductionLabel && analysisResult.reproductionProvided) {
      // we can go ahead and remove the 'needs reproduction' label
      promises.push(
        github.issues.removeLabel({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          name: IssueLabel.NeedsReproduction,
        }),
      )
      // ... plus, if issue is closed, we'll reopen it
      if (issue.state === 'closed') {
        promises.push(
          github.issues.update({
            owner: repository.owner.login,
            repo: repository.name,
            issue_number: issue.number,
            state: 'open',
          }),
        )
      }
    }
    // 2. if a resolved issue reappears
    else if (issue.state === 'closed' && analysisResult.possibleRegression) {
      // then reopen the issue
      promises.push(
        github.issues.update({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          state: 'open',
        }),
      )

      // ... and add 'pending triage' and 'possible regression' labels
      promises.push(
        github.issues.addLabels({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          labels: [IssueLabel.PendingTriage, IssueLabel.PossibleRegression],
        }),
      )
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
  if (issue.user?.type === 'Bot') {
    return
  }

  const issueLabels = issue.labels?.map(label => label.name) || []
  const hasNeedsReproductionLabel = issueLabels.includes(IssueLabel.NeedsReproduction)

  if (!hasNeedsReproductionLabel) {
    return null
  }

  const github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  try {
    const res = await hubAI().run('@hf/nousresearch/hermes-2-pro-mistral-7b', {
      messages: [
        {
          role: 'system',
          content: `You are a kind, helpful open-source maintainer that answers in JSON. Do not answer with anything else other than a valid JSON. Here's the json schema you must adhere to:\n<schema>\n${JSON.stringify(commentAnalysisSchema)}\n</schema>\n`,
        },
        { role: 'user', content: JSON.stringify({ title: issue.title, body: getNormalizedIssueContent(issue.body || '') }) },
      ],
    })

    setHeader(event, 'x-issue-edit-analysis', JSON.stringify(res))

    const analysisResult: CommentAnalysisResult = 'response' in res ? commentAnalysisResponseSchema.parse(JSON.parse(res.response || '{}')) : {}

    if (analysisResult.reproductionProvided) {
      // we can go ahead and remove the 'needs reproduction' label
      promises.push(
        github.issues.removeLabel({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          name: IssueLabel.NeedsReproduction,
        }),
      )

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
        { role: 'user', content: JSON.stringify({ title: issue.title, body: getNormalizedIssueContent(issue.body || '') }) },
      ],
    })

    setHeader(event, 'x-ai-response', JSON.stringify(res))

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

  const github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  // Update the GitHub issue
  try {
    const labels: IssueLabel[] = []

    if (analyzedIssue.issueType === IssueType.Spam) {
      promises.push(
        github.graphql(`
          mutation {
            transferIssue(input: { issueId: "${issue.node_id}", repositoryId: "${runtimeConfig.github.targetRepositoryNodeId}" }) {
              issue {
                number
              }
            }
          }
        `),
      )
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
    }

    if (labels.length > 0) {
      promises.push(
        github.issues.addLabels({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          labels,
        }),
      )
    }

    if (['documentation', 'bug', 'enhancement'].includes(analyzedIssue.issueType)) {
      promises.push(github.issues.update({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: issue.number,
        type: analyzedIssue.issueType,
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

        setHeader(event, 'x-translation-response', JSON.stringify(res))

        const { translated_text } = translationResponseSchema.parse(res)

        if (!translated_text || !translated_text.trim().length) return
        promises.push(
          github.issues.update({
            owner: repository.owner.login,
            repo: repository.name,
            issue_number: issue.number,
            title: `[${analyzedIssue?.spokenLanguage}:translated] ${translated_text}`,
          }),
        )
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

const commentAnalysisSchema = {
  title: 'Issue Categorisation',
  type: 'object',
  properties: {
    reproductionProvided: { type: 'boolean' },
    possibleRegression: { type: 'boolean', comment: 'If the issue has reappeared on upgrade to a new version of Nuxt, it is a possible regression.' },
  },
}

const commentAnalysisResponseSchema = z.object({
  reproductionProvided: z.boolean().optional(),
  possibleRegression: z.boolean().optional(),
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
