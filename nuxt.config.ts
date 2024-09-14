// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-08-07',
  devtools: { enabled: true },
  experimental: { noVueServer: true },
  routeRules: {
    '/': { prerender: true },
  },
  modules: ['@nuxthub/core', '@nuxt/eslint', 'nuxt-webhook-validators'],
  eslint: {
    config: {
      stylistic: true,
    },
  },
  runtimeConfig: {
    cloudflare: {
      apiToken: '',
    },
    github: {
      token: process.env.NUXT_GITHUB_TOKEN || '',
    },
  },
  hub: {
    ai: true,
  },
})
