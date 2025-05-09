# 🔨 Carpenter

> An LLM-powered GitHub bot for issue triage automation in the Nuxt ecosystem

Carpenter is an automated assistant that helps with issue triage in the [Nuxt GitHub repository](https://github.com/nuxt/nuxt). It uses AI to analyze issues, categorise them, detect missing reproductions, handle reopened issues, and translate non-English content.

## 🛠️ Tech Stack

- Built on [Nuxt](https://nuxt.com/)
- [Nitro server API routes](https://nuxt.com/docs/guide/concepts/server-engine#server-engine)
- [GitHub API](https://docs.github.com/en/rest)
- Deployed on [NuxtHub](https://hub.nuxt.com/) using [Cloudflare AI](https://developers.cloudflare.com/workers-ai)
- Uses [Hugging Face models](https://huggingface.co/) for natural language processing

## 🚀 Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- PNPM package manager
- GitHub account with access to create GitHub Apps
- Cloudflare account for deployment

### Local Development

```bash
# Install dependencies
corepack enable
pnpm install

# Start development server
pnpm dev
```

### Environment Setup

Create a `.env` file with:

```ini
NUXT_HUB_PROJECT_KEY=<your-hub-project-key>
NUXT_CLOUDFLARE_API_TOKEN=<your-cloudflare-api-token>
NUXT_GITHUB_TOKEN=<your-github-token>
NUXT_GITHUB_TARGET_REPOSITORY_NODE_ID=<node id of repo to transfer spam issues to>
NUXT_WEBHOOK_GITHUB_SECRET_KEY=<your-webhook-secret-key>

# Cloudflare configuration (if applicable)
# Add any Cloudflare-specific environment variables
CLOUDFLARE_ACCOUNT_ID=<your-cloudflare-account-id>
```

You'll also need to configure GitHub webhooks for the repository you want to monitor. Set up a webhook with the following settings:
- **Payload URL**: `https://<your-cloudflare-worker-url>/api/webhook`
- **Content type**: `application/json`
- **Secret**: `<your-webhook-secret>`

## 📄 License

Published under [MIT License](./LICENCE).
