// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxthub/core', '@nuxt/eslint'],
  runtimeConfig: {
    cloudflare: {
      accountId: '83430b3b7efdba7efceccf3a2f921042',
      apiToken: ''
    },
    github: {
      token: ''
    }
  },
  hub: {
    // @ts-expect-error patched version of nuxt hub
    ai: true
  },
})
