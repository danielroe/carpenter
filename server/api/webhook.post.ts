export default defineEventHandler(async (event) => {
  const isValidWebhook = await isValidGithubWebhook(event)

  if (!import.meta.dev && !isValidWebhook) {
    throw createError({ statusCode: 401, message: 'Unauthorized: webhook is not valid' })
  }

  // TODO: implement as a GitHub app
  const { action, issue, repository /* installation */ } = await readBody(event)
  if (action !== 'opened') return null

  const body = (issue.body || '')
    .replace(/<!--.*?-->/g, ' ')
    .replace(/https:\/\/stackblitz.com\/github\/nuxt\/starter/g, '')

  if (body.split(' ').length > 200) return null

  const ai = hubAI()

  const res = await ai.run('@hf/nousresearch/hermes-2-pro-mistral-7b', {
    messages: [
      {
        role: 'system', content: `You are a kind, helpful open-source maintainer that answers in JSON. Here\`s the json schema you must adhere to:\n<schema>\n${JSON.stringify(responseSchema)}\n</schema>\n`,
      },
      { role: 'user', content: `# ${issue.title}\n\n${issue.body}` },
    ],
  }) as { response?: string, tool_calls?: { name: string, arguments: unknown }[] }
  const answer = res.response?.trim() || ''

  try {
    const value = JSON.parse(answer) as Response

    const $github = useGitHubAPI(event)
    const promises: Array<Promise<unknown>> = []

    const labels = []

    if (value.issueType === 'bug' && value.reproductionProvided === false) {
      labels.push('needs reproduction')
    }
    if (value.issueType === 'bug' && value.possibleRegression === true) {
      labels.push('possible regression')
    }
    if (value.nitro === true) {
      labels.push('nitro')
    }
    if (value.issueType === 'documentation') {
      labels.push('documentation')
    }

    if (labels.length > 0) {
      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}/labels`, {
        method: 'POST',
        body: { labels },
      }))
    }

    if (value.spokenLanguage.toLowerCase() !== 'english') {
      await ai.run('@cf/meta/m2m100-1.2b', {
        text: issue.title,
        source_lang: value.spokenLanguage.toLowerCase(),
        target_lang: 'english',
      }).then(({ translated_text }) => {
        promises.push($github(`repos/${repository.full_name}/issues/${issue.number}`, {
          method: 'PATCH',
          body: {
            title: translated_text,
          },
        }))
      }).catch(console.error)
    }

    event.waitUntil(Promise.all(promises))

    return null
  }
  catch (err) {
    console.log(err)
    console.error('Could not parse response from OpenAI', answer)
    throw createError({ message: 'Could not parse.' })
  }
})

const responseSchema = {
  title: 'Issue Categorisation',
  type: 'object',
  properties: {
    issueType: { type: 'string', enum: ['bug', 'feature', 'documentation'] },
    reproductionProvided: { type: 'boolean' },
    spokenLanguage: { type: 'string' },
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

type Response = {
  [key in keyof typeof responseSchema['properties']]: typeof responseSchema['properties'][key]['type'] extends 'string' ? 'enum' extends keyof typeof responseSchema['properties'][key] ? typeof responseSchema['properties'][key]['enum'] extends Array<infer S> ? S : string : string : typeof responseSchema['properties'][key]['type'] extends 'boolean' ? boolean : unknown
}
