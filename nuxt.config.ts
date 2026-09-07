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
      // Major version currently developed on `main`; used when a report only
      // says "nightly"/"main" without a version number. Override with
      // NUXT_TRIAGE_MAIN_BRANCH_MAJOR when a new major is released.
      mainBranchMajor: '5',
    },
  },
  routeRules: {
    '/': { prerender: true },
  },
  experimental: { noVueServer: true },
  compatibilityDate: '2024-08-07',
  typescript: {
    tsConfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
        erasableSyntaxOnly: true,
      },
    },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
