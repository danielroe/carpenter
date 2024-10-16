// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@nuxt/eslint', 'nuxt-webhook-validators'],
  devtools: { enabled: true },
  runtimeConfig: {
    github: {
      token: process.env.NUXT_GITHUB_TOKEN || '',
      targetRepositoryNodeId: process.env.NUXT_GITHUB_TARGET_REPOSITORY_NODE_ID || '',
    },
  },
  routeRules: {
    '/': { prerender: true },
  },
  experimental: { noVueServer: true },
  compatibilityDate: '2024-08-07',
  hub: {
    ai: true,
    kv: true,
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
