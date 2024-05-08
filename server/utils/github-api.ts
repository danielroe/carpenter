import type { H3Event } from 'h3'
import type { $Fetch, NitroFetchRequest } from 'nitropack'

export function useGitHubAPI (event: H3Event) {
  const config = useRuntimeConfig(event)

  if (import.meta.dev) {
    return console.log as $Fetch<unknown, NitroFetchRequest>
  }

  // Create API client with default values for readability
  return $fetch.create({
    baseURL: `https://api.github.com`,
    headers: {
      Authorization: `Bearer ${config.githubToken || process.env.NUXT_GITHUB_TOKEN}`,
      'User-Agent': 'Nuxtbot',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  })
}


