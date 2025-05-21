import type { H3Event } from 'h3'
import { Octokit } from '@octokit/rest'
import { getLoggerProxy } from './proxy'

export function useGitHubAPI(event: H3Event) {
  const config = useRuntimeConfig(event)

  if (import.meta.dev) {
    return getLoggerProxy<Octokit>('github')
  }

  return new Octokit({
    auth: config.github.token,
    userAgent: 'Nuxtbot',
    baseUrl: 'https://api.github.com',
    previews: [],
    timeZone: 'UTC',
  })
}
