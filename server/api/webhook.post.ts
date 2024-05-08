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
      role: 'system', content: 'You are a kind, helpful open-source maintainer. You only respond in a JSON object with the following keys: issueType, reproductionProvided, needsTranslationToEnglish.'
    },
    { role: 'user', content: `# A problem with the docs\n\nThe website isn't displaying properly.` },
    { role: 'assistant', content: JSON.stringify({ issueType: 'documentation', reproductionProvided: false, needsTranslationToEnglish: false }) },
    { role: 'user', content: `# Runtime config doesn't work\n\nHere's a link to reproduce: https://stackblitz.com/github/my/site.` },
    { role: 'assistant', content: JSON.stringify({ issueType: 'bug', reproductionProvided: true, needsTranslationToEnglish: false }) },
    { role: 'user', content: `# ${issue.title}\n\n${issue.body}` },
  ])

  const answer = res.match(/\{[\s\S]*\}/g)?.[0] || ''

  try {
    const value = JSON.parse(answer)

    const $github = useGitHubAPI(event)
    const promises: Array<Promise<any>> = []

    if (value.issueType === 'bug' && value.reproductionProvided === false) {
      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}/labels`, {
        method: 'POST',
        body: {
          labels: ['needs reproduction']
        }
      }))
    }

    if (value.needsTranslationToEnglish) {
      const [title, summary] = await Promise.all([
        sendMessages(event, '@cf/meta/llama-3-8b-instruct', [
          { role: 'system', content: 'You are an expert translator. You translate into English everything said to you without adding any comment of your own.' },
          { role: 'user', content: `${issue.title}` },
        ]),
        sendMessages(event, '@cf/meta/llama-3-8b-instruct', [
          { role: 'system', content: 'You are an expert translator. You generate a brief summary in English everything said to you without adding any comment of your own.' },
          { role: 'user', content: `${issue.body}` },
        ])
      ])

      promises.push($github(`repos/${repository.full_name}/issues/${issue.number}`, {
        method: 'PATCH',
        body: {
          title,
          body: `**Summary (generated)**:\n\n${summary}\n\n<hr>\n\n${issue.body}`
        }
      }))
    }

    await Promise.all(promises)

    return null

  } catch (err) {
    console.log(err)
    console.error('Could not parse response from OpenAI', answer)
    throw createError({ message: 'Could not parse.' })
  }
})

