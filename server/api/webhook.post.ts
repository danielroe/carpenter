export default defineEventHandler(async event => {
  // TODO: Verify the request is from GitHub

  // TODO: implement as a GitHub app
  const { action, issue, repository, /* installation */ } = await readBody(event)
  if (action !== 'opened') return null

  const body = (issue.body || '')
    .replace(/<!--.*?-->/g, ' ')
    .replace(/https:\/\/stackblitz.com\/github\/nuxt\/starter/g, '')

  if (body.split(' ').length > 200) return null

  const res = await sendMessages(event, '@cf/meta/llama-3-8b-instruct', [
    {
      role: 'system', content: 'You are a kind, helpful open-source maintainer. You only respond in a JSON object with the following keys: issueType, reproductionProvided.'
    },
    { role: 'user', content: `# A problem with the docs\n\nThe website isn't displaying properly.` },
    { role: 'assistant', content: JSON.stringify({ issueType: 'documentation', reproductionProvided: false }) },
    { role: 'user', content: `# Runtime config doesn't work\n\nHere's a link to reproduce: https://stackblitz.com/github/my/site.` },
    { role: 'assistant', content: JSON.stringify({ issueType: 'bug', reproductionProvided: true }) },
    { role: 'user', content: `# ${issue.title}\n\n${issue.body}` },
  ])

  const answer = res.match(/\{[\s\S]*\}/g)?.[0] || ''

  let value

  try {
    value = JSON.parse(answer)
  } catch {
    console.error('Could not parse response from OpenAI', answer)
    throw createError({ message: 'Could not parse.' })
  }

  if (value.issueType === 'bug' && value.reproductionProvided === false) {
    const $github = useGitHubAPI(event)
    try {
      await $github(`repos/${repository.full_name}/issues/${issue.number}/labels`, {
        method: 'POST',
        body: {
          labels: ['needs reproduction']
        }
      })
    } catch (err) {
      console.log(err)
      throw createError('Could not add label.')
    }
  }

  return null
})

