import type { H3Event } from 'h3'
import { Octokit } from '@octokit/rest'

export function useGitHubAPI(event: H3Event) {
  const config = useRuntimeConfig(event)

  return new Octokit({
    auth: config.github.token,
    userAgent: 'Nuxtbot',
    baseUrl: 'https://api.github.com',
    previews: [],
    timeZone: 'UTC',
  })
}
