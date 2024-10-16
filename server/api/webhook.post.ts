import { z } from 'zod'
import { isError } from 'h3'

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)

  const isValidWebhook = await isValidGithubWebhook(event)

  if (!import.meta.dev && !isValidWebhook) {
    throw createError({ statusCode: 401, message: 'Unauthorized: webhook is not valid' })
  }

  // TODO: implement as a GitHub app
  const { action, issue, repository /* installation */ } = await readValidatedBody(event, githubWebhookSchema.parse)
  if (action !== 'opened') return null

  const ai = hubAI()

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
      await ai.run('@cf/meta/m2m100-1.2b', {
        text: issue.title,
        source_lang: analyzedIssue.spokenLanguage,
        target_lang: 'english',
      }).then(({ translated_text }) => {
        if (!translated_text || !translated_text.trim().length) return
        promises.push($github(`repos/${repository.full_name}/issues/${issue.number}`, {
          method: 'PATCH',
          body: {
            title: `[${analyzedIssue?.spokenLanguage}:translated] ${translated_text}`,
          },
        }))
      }).catch(console.error)
    }

    event.waitUntil(Promise.all(promises))
    setHeader(event, 'x-assigned-labels', JSON.stringify(labels))

    return null
  }
  catch (e) {
    console.error('Error updating issue', e)
    throw createError({
      statusCode: 500,
      message: 'Error updating issue',
    })
  }
})

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

enum IssueLabel {
  NeedsReproduction = 'needs reproduction',
  PossibleRegression = 'possible regression',
  Nitro = 'nitro',
  Documentation = 'documentation',
}

enum IssueType {
  Bug = 'bug',
  Feature = 'feature',
  Documentation = 'documentation',
  Spam = 'spam',
}

const githubWebhookSchema = z.object({
  action: z.string(),
  issue: z.object({
    title: z.string(),
    body: z.string().nullable(),
    number: z.number(),
    node_id: z.string(),
  }),
  repository: z.object({
    full_name: z.string(),
  }),
  // TODO: implement as a GitHub app
  installation: z.any().optional(),
})

const aiResponseSchema = z.object({
  response: z.string().optional(),
  tool_calls: z.array(z.object({
    name: z.string(),
    arguments: z.unknown(),
  })).optional(),
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
