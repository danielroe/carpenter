# 🔨 Carpenter

> An LLM-powered GitHub bot for issue triage automation in the Nuxt ecosystem

Carpenter is an automated assistant that helps with issue triage in the [Nuxt GitHub repository](https://github.com/nuxt/nuxt). It uses AI to analyse issues, categorise them, detect missing reproductions, handle reopened issues, and translate non-English content.

## What it does

On `issues.opened`:

- Categorises the issue (bug / enhancement / documentation / spam) and sets the GitHub issue type
- Labels bugs without a reproduction as `needs reproduction`
- Labels possible regressions and Nitro/deployment-provider-specific issues
- Adds `pending triage` when nothing else applies
- Transfers spam issues to a separate repository (falling back to a `spam` label if transfer fails)
- Translates non-English issues (title prefix + appended body translation)

On `issues.edited` and `issue_comment.created`:

- Removes `needs reproduction` when a reproduction is added, reopening the issue if needed
- For comments on closed issues, runs a deeper analysis (recent comments + timeline) to decide whether to reopen: regressions, "not planned" issues with new evidence, or duplicates that turn out to be distinct. Guarded by confidence levels and reopen history.

On `issues.labeled`:

- `spam` label added: transfers the issue to the spam repository

Comments and edits from bots and repository collaborators are ignored; humans always have the final say.

Label-triggered comments (e.g. reproduction guidance when `needs reproduction` is added, AI contribution policy when `possible bot` is added) remain as plain GitHub Actions workflows in [nuxt/.github](https://github.com/nuxt/.github); they need no LLM, and labels added by Carpenter trigger them normally since Carpenter acts with its own identity rather than the Actions `GITHUB_TOKEN`.

## 🛠️ Tech Stack

- Built on [Nuxt](https://nuxt.com/) with [Nitro server routes](https://nuxt.com/docs/guide/concepts/server-engine)
- [AI SDK](https://ai-sdk.dev/) with the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) for model access
- [Valibot](https://valibot.dev/) schemas for structured model output
- [GitHub API](https://docs.github.com/en/rest) via Octokit
- Deployed on [Vercel](https://vercel.com/)

## 🚀 Getting Started

### Local Development

```bash
corepack enable
pnpm install
pnpm dev
```

In dev mode, GitHub API calls are logged rather than executed, and webhook signature validation is skipped.

### Environment Setup

Create a `.env` file with:

```ini
# Vercel AI Gateway (provisioned automatically via OIDC when deployed on Vercel)
AI_GATEWAY_API_KEY=<your-ai-gateway-api-key>

NUXT_GITHUB_TOKEN=<your-github-token>
NUXT_GITHUB_TARGET_REPOSITORY_NODE_ID=<node id of repo to transfer spam issues to>
NUXT_WEBHOOK_GITHUB_SECRET_KEY=<your-webhook-secret-key>

# Optional model overrides (any Vercel AI Gateway model identifier)
NUXT_AI_SIMPLE_MODEL=openai/gpt-4o-mini
NUXT_AI_COMPLEX_MODEL=openai/gpt-4o
```

Other optional overrides: `NUXT_TRIAGE_PROJECT_NAME`, `NUXT_TRIAGE_TRANSLATE_ISSUES`.

### GitHub webhook

Configure a webhook on the repository you want to monitor:

- **Payload URL**: `https://<your-deployment>/api/webhook`
- **Content type**: `application/json`
- **Secret**: `<your-webhook-secret>`
- **Events**: Issues, Issue comments

## 📄 License

Published under [MIT License](./LICENCE).
