// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-08-07',
  devtools: { enabled: true },
  experimental: { noVueServer: true },
  routeRules: {
    '/': { prerender: true }
  },
  modules: ['@nuxthub/core', '@nuxt/eslint'],
  runtimeConfig: {
    cloudflare: {
      accountId: '83430b3b7efdba7efceccf3a2f921042',
      apiToken: ''
    },
    github: {
      token: process.env.NUXT_GITHUB_TOKEN || ''
    }
  },
  hub: {
    // @ts-expect-error patched version of nuxt hub
    ai: true
  },
})
