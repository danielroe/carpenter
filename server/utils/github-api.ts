import type { H3Event } from 'h3'

export function useGitHubAPI (event: H3Event) {
  const config = useRuntimeConfig(event)

  // Create API client with default values for readability
  return $fetch.create({
    baseURL: `https://api.github.com`,
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      'User-Agent': 'Nuxtbot',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  })
}


