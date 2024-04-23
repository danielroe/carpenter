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
    { role: 'system', content: 'You are a kind, helpful open-source maintainer who only speaks JSON.' },
    { role: 'user', content: `${issue.title}\n\n${issue.body}` },
    { role: 'system', content: "Analyze the user's issue. It might be either a feature request (or enhancement), a bug report, or related to the project documentation or website. Reply with a JSON-formatted object containing the following properties:\n\n- `reproductionProvided` (true/false, with true indicating that a link to a code reproduction was provided, or there is enough information to reproduce the problem).\n\n- `issueType` ('enhancement', 'documentation' or 'bug' depending on the type of issue).\n\n\n\nInclude nothing but a JSON object in your response." },
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

  return res
})
