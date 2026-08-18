// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', 'nuxt-webhook-validators'],
  devtools: { enabled: true },
  runtimeConfig: {
    github: {
      token: '',
      targetRepositoryNodeId: '',
    },
    ai: {
      // Vercel AI Gateway model identifiers; override with
      // NUXT_AI_SIMPLE_MODEL / NUXT_AI_COMPLEX_MODEL
      simpleModel: 'openai/gpt-4o-mini',
      complexModel: 'openai/gpt-4o',
    },
    triage: {
      projectName: 'Nuxt framework',
      translateIssues: true,
    },
  },
  routeRules: {
    '/': { prerender: true },
  },
  experimental: { noVueServer: true },
  compatibilityDate: '2024-08-07',
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
