import type { H3Event } from 'h3'

export function useGitHubAPI (event: H3Event) {
  const config = useRuntimeConfig(event)

  console.log('GitHub token:', !!config.githubToken, config.githubToken?.slice(-5))
  console.log('GitHub token:', !!process.env.NUXT_GITHUB_TOKEN, process.env.NUXT_GITHUB_TOKEN?.slice(-5))
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


